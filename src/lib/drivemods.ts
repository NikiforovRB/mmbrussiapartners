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
  constructor(message: string, status = 500) {
    super(message);
    this.name = "DriveModsError";
    this.status = status;
  }
}

export function isDriveModsConfigured(): boolean {
  return Boolean(CLIENT_TOKEN && USERNAME && PASSWORD);
}

let sessionCache: { token: string; ts: number } | null = null;

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function login(): Promise<string> {
  if (!isDriveModsConfigured()) {
    throw new DriveModsError("Интеграция DRIVEMODS не настроена (нет учётных данных мастер-аккаунта).", 503);
  }
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD, clientToken: CLIENT_TOKEN }),
    cache: "no-store",
  });
  const data = await parseJson(res);
  if (!res.ok || !data.sessionToken) {
    const msg = (data.error as string) || "Ошибка авторизации DRIVEMODS";
    throw new DriveModsError(msg, res.status || 401);
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
  const doCall = async (sessionToken: string) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        sessionToken,
        uid: USERNAME,
        clientToken: CLIENT_TOKEN,
      }),
      cache: "no-store",
    });
    return res;
  };

  let sessionToken = await getSession();
  let res = await doCall(sessionToken);
  if (res.status === 401) {
    sessionToken = await getSession(true);
    res = await doCall(sessionToken);
  }
  const data = await parseJson(res);
  if (!res.ok) {
    const msg = (data.error as string) || `Ошибка DRIVEMODS (${res.status})`;
    throw new DriveModsError(msg, res.status);
  }
  return data;
}

/**
 * Получение информации о лицензии по файлу device_id.bin (base64).
 */
export async function licInfo(deviceIdBase64: string): Promise<LicInfoResponse> {
  const data = await callAuthed("/licinfo", { did: deviceIdBase64 });
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
  const data = await callAuthed("/createlic", {
    did: params.deviceIdBase64,
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
    const res = await fetch(`${BASE_URL}/health`, { cache: "no-store" });
    const data = await parseJson(res);
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
