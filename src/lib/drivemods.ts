import "server-only";

/**
 * Клиент REST API DRIVEMODS Store (личный кабинет представителя).
 * Документация: DRIVEMODS_StoreAPI v1.1 — базовый адрес https://storeapi.drivemods.org
 *
 * Портал работает от имени единого мастер-аккаунта DriveMods
 * (DRIVEMODS_USERNAME / DRIVEMODS_PASSWORD + DRIVEMODS_CLIENT_TOKEN),
 * а имя конкретного субдилера передаётся в поле dealer_comment.
 */

const BASE_URL = process.env.DRIVEMODS_STORE_API_URL ?? "https://storeapi.drivemods.org";
const CLIENT_TOKEN = process.env.DRIVEMODS_CLIENT_TOKEN ?? "";
const USERNAME = process.env.DRIVEMODS_USERNAME ?? "";
const PASSWORD = process.env.DRIVEMODS_PASSWORD ?? "";

const SESSION_TTL_MS = 10 * 60 * 1000;

/** Без таймаута зависший сервис держал бы наш роут до таймаута платформы. */
const REQUEST_TIMEOUT_MS = Number(process.env.DRIVEMODS_TIMEOUT_MS ?? 20_000);

export type LicInfoItem = {
  product: string;
  bundle: string | null;
  region: string | null;
};

export type LicInfoResponse = {
  recoverable: boolean;
  version_software: string;
  version_custom: string;
  device_id: string;
  items: LicInfoItem[];
};

export type CreateLicResponse = {
  lic_file: string; // base64 device-license.bin
  lic_filename: string;
  device_id: string;
};

export class DriveModsError extends Error {
  status: number;
  /** Ответ DRIVEMODS как есть: годится для лога, но не для показа дилеру. */
  upstream: string | null;

  constructor(message: string, status = 500, upstream: string | null = null) {
    super(message);
    this.name = "DriveModsError";
    this.status = status;
    this.upstream = upstream;
  }
}

/**
 * Текст для дилера и код ответа нашего API. Сообщения DRIVEMODS вида
 * «Неверный ответ генератора лицензий» наружу не выпускаем: они ничего
 * не говорят о том, что делать дальше.
 */
export function describeDriveModsFailure(err: unknown): { status: number; message: string } {
  if (!(err instanceof DriveModsError)) {
    return { status: 502, message: "Сервис лицензий DRIVEMODS недоступен. Попробуйте позже." };
  }
  if (err.status === 504) {
    return { status: 504, message: "Сервис DRIVEMODS не ответил вовремя. Повторите попытку." };
  }
  if (err.status === 503) {
    return { status: 503, message: err.message };
  }
  if (err.status === 401 || err.status === 403) {
    return {
      status: 502,
      message: "Портал не смог авторизоваться в DRIVEMODS. Сообщите администратору.",
    };
  }
  if (err.status === 400 || err.status === 422) {
    return {
      status: 422,
      message: "DRIVEMODS отклонил запрос: файл device_id.bin не подходит для генерации.",
    };
  }
  return {
    status: 502,
    message:
      "DRIVEMODS не смог обработать файл device_id.bin. Убедитесь, что это оригинальный файл, " +
      "выгруженный из ШГУ и не изменённый после выгрузки. Если файл верный — генератор лицензий " +
      "DRIVEMODS сейчас недоступен, попробуйте позже.",
  };
}

export function isDriveModsConfigured(): boolean {
  return Boolean(CLIENT_TOKEN && USERNAME && PASSWORD);
}

let sessionCache: { token: string; ts: number } | null = null;

/**
 * DRIVEMODS декодирует did URL-безопасным алфавитом. Обычный base64 его
 * генератор не разбирает и отвечает 502 «Неверный ответ генератора лицензий»,
 * поэтому приводим к base64url любой вход: и серверный, и снятый в браузере
 * через btoa.
 */
function toBase64Url(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Тело ответа разбираем один раз: сырой текст нужен для лога. */
async function readBody(res: Response): Promise<{ data: Record<string, unknown>; raw: string }> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, raw };
    }
  } catch {
    /* не JSON — ниже вернём пустой объект, текст останется в raw */
  }
  return { data: {}, raw };
}

async function post(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new DriveModsError(
      timedOut
        ? `DRIVEMODS не ответил за ${Math.round(REQUEST_TIMEOUT_MS / 1000)} с`
        : "Не удалось связаться с DRIVEMODS",
      timedOut ? 504 : 503,
      err instanceof Error ? err.message : null,
    );
  }
}

async function login(): Promise<string> {
  if (!isDriveModsConfigured()) {
    throw new DriveModsError("Интеграция DRIVEMODS не настроена (нет учётных данных мастер-аккаунта).", 503);
  }
  const res = await post("/login", {
    username: USERNAME,
    password: PASSWORD,
    clientToken: CLIENT_TOKEN,
  });
  const { data, raw } = await readBody(res);
  if (!res.ok || !data.sessionToken) {
    const msg = (data.error as string) || "Ошибка авторизации DRIVEMODS";
    throw new DriveModsError(msg, res.status || 401, raw.slice(0, 500));
  }
  const token = data.sessionToken as string;
  sessionCache = { token, ts: Date.now() };
  return token;
}

async function getSession(force = false): Promise<string> {
  if (!force && sessionCache && Date.now() - sessionCache.ts < SESSION_TTL_MS) {
    return sessionCache.token;
  }
  return login();
}

/**
 * Вызов защищённого метода с автоматическим переполучением сессии при 401.
 */
async function callAuthed(
  path: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const doCall = (sessionToken: string) =>
    post(path, { ...payload, sessionToken, uid: USERNAME, clientToken: CLIENT_TOKEN });

  let sessionToken = await getSession();
  let res = await doCall(sessionToken);
  if (res.status === 401) {
    sessionCache = null;
    sessionToken = await getSession(true);
    res = await doCall(sessionToken);
  }
  const { data, raw } = await readBody(res);
  if (!res.ok) {
    const msg = (data.error as string) || `Ошибка DRIVEMODS (${res.status})`;
    console.error(`[drivemods] ${path} → ${res.status} ${raw.slice(0, 500)}`);
    throw new DriveModsError(msg, res.status, raw.slice(0, 500));
  }
  return data;
}

/**
 * Получение информации о лицензии по файлу device_id.bin (base64).
 */
export async function licInfo(deviceIdBase64: string): Promise<LicInfoResponse> {
  const data = await callAuthed("/licinfo", { did: toBase64Url(deviceIdBase64) });
  const rawItems = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  return {
    recoverable: Boolean(data.recoverable),
    version_software: (data.version_software as string) ?? "",
    version_custom: (data.version_custom as string) ?? "",
    device_id: (data.device_id as string) ?? "",
    items: rawItems.map((it) => ({
      product: (it.product as string) ?? "",
      bundle: (it.bundle as string) ?? null,
      region: (it.region as string) ?? null,
    })),
  };
}

export type CreateLicParams = {
  deviceIdBase64: string;
  product: string;
  bundle: string | null;
  region: string | null;
  versionSoftware: string;
  versionCustom: string;
  dealerComment: string;
  deviceId: string;
};

/**
 * Генерация лицензии.
 */
export async function createLic(params: CreateLicParams): Promise<CreateLicResponse> {
  // Пустые bundle и dealer_comment сервис считает отсутствующими параметрами
  // и отвечает невнятным 400 — отсекаем заранее понятным текстом.
  const missing = [
    !params.product && "продукт",
    !params.bundle && "комплектация (bundle)",
    !params.dealerComment.trim() && "комментарий дилера",
    !params.deviceId && "идентификатор устройства",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new DriveModsError(`DRIVEMODS требует заполнить: ${missing.join(", ")}`, 400);
  }

  const data = await callAuthed("/createlic", {
    did: toBase64Url(params.deviceIdBase64),
    product: params.product,
    bundle: params.bundle,
    region: params.region,
    version_software: params.versionSoftware,
    version_custom: params.versionCustom,
    dealer_comment: params.dealerComment,
    device_id: params.deviceId,
  });
  if (!data.lic_file) {
    throw new DriveModsError("DRIVEMODS не вернул файл лицензии", 502);
  }
  return {
    lic_file: data.lic_file as string,
    lic_filename: (data.lic_filename as string) ?? "device-license.bin",
    device_id: (data.device_id as string) ?? params.deviceId,
  };
}

export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const { data } = await readBody(res);
    return res.ok && data.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Полное название продукта: product [bundle] [region] через пробел.
 */
export function productFullName(item: LicInfoItem): string {
  return [item.product, item.bundle, item.region].filter(Boolean).join(" ");
}
