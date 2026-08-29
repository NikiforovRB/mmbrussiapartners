import "server-only";

/**
 * АТОЛ Онлайн — облачная касса (54-ФЗ).
 *
 * Сервис НЕ принимает деньги: он только регистрирует фискальные чеки.
 * Приём оплаты — задача эквайринга (см. ./provider.ts).
 *
 * Учётные данные берутся из «файла настроек интеграции» в личном кабинете
 * АТОЛ Онлайн, а не из логина/пароля самого кабинета.
 *
 * Поддерживаются обе версии протокола: код группы ККТ привязан к одной из них,
 * и обращение «не своей» версией отклоняется с ошибкой 21. Версия берётся из
 * ATOL_BASE_URL, от неё же зависит схема позиции чека:
 *   v4 (ФФД 1.05) — payment_object строкой, единица измерения measurement_unit;
 *   v5 (ФФД 1.2)  — payment_object числом, обязательное числовое measure.
 *
 * Спецификации: https://atol.online/api_v4, https://atol.online/api_v5
 */

const BASE_URL = (process.env.ATOL_BASE_URL ?? "https://online.atol.ru/possystem/v4").replace(/\/+$/, "");
const LOGIN = process.env.ATOL_LOGIN ?? "";
const PASSWORD = process.env.ATOL_PASSWORD ?? "";
const GROUP = process.env.ATOL_GROUP ?? "";
const IS_V5 = /\/v5$/.test(BASE_URL);

/** Токен живёт 24 часа; обновляем заранее, чтобы не ловить 401 на границе. */
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

export type AtolReceiptStatus = "wait" | "done" | "fail";

export type AtolReceiptItem = {
  name: string;
  price: number;
  quantity: number;
  sum: number;
};

export type AtolRegisterInput = {
  /** Уникальный в пределах группы ККТ идентификатор документа. */
  externalId: string;
  items: AtolReceiptItem[];
  total: number;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  callbackUrl?: string | null;
};

export type AtolReport = {
  status: AtolReceiptStatus;
  uuid: string | null;
  ofdReceiptUrl: string | null;
  fiscalDocumentNumber: string | null;
  errorText: string | null;
  raw: unknown;
};

export class AtolError extends Error {
  code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "AtolError";
    this.code = code;
  }
}

export function isAtolConfigured(): boolean {
  return Boolean(LOGIN && PASSWORD && GROUP);
}

/** Чего именно не хватает — чтобы показать администратору в настройках. */
export function atolMissingEnv(): string[] {
  const missing: string[] = [];
  if (!LOGIN) missing.push("ATOL_LOGIN");
  if (!PASSWORD) missing.push("ATOL_PASSWORD");
  if (!GROUP) missing.push("ATOL_GROUP");
  if (!process.env.ATOL_COMPANY_INN) missing.push("ATOL_COMPANY_INN");
  return missing;
}

let tokenCache: { token: string; ts: number } | null = null;

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** АТОЛ возвращает ошибку объектом {code, text, type} в поле error. */
function readError(data: Record<string, unknown>): { code: number | null; text: string } | null {
  const err = data.error;
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  return {
    code: typeof e.code === "number" ? e.code : null,
    text: typeof e.text === "string" ? e.text : "Неизвестная ошибка АТОЛ",
  };
}

async function getToken(force = false): Promise<string> {
  if (!isAtolConfigured()) {
    throw new AtolError(
      "Фискализация АТОЛ Онлайн не настроена: заполните ATOL_LOGIN, ATOL_PASSWORD и ATOL_GROUP.",
    );
  }
  if (!force && tokenCache && Date.now() - tokenCache.ts < TOKEN_TTL_MS) {
    return tokenCache.token;
  }
  const res = await fetch(`${BASE_URL}/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ login: LOGIN, pass: PASSWORD }),
    cache: "no-store",
  });
  const data = await parseJson(res);
  const token = typeof data.token === "string" ? data.token : "";
  if (!token) {
    const err = readError(data);
    throw new AtolError(err?.text ?? `Не удалось получить токен АТОЛ (${res.status})`, err?.code ?? null);
  }
  tokenCache = { token, ts: Date.now() };
  return token;
}

/** "dd.mm.yyyy HH:MM:SS" — формат, которого требует API. */
function atolTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildReceipt(input: AtolRegisterInput) {
  const vatType = process.env.ATOL_VAT_TYPE || "none";
  // Признак предмета расчёта: услуга (право использования ПО).
  // В v5 это числовой код ФФД 1.2, в v4 — строковый enum.
  const paymentObject = process.env.ATOL_PAYMENT_OBJECT ?? (IS_V5 ? "4" : "service");

  // Тег 1008: ОФД отправляет чек покупателю, поэтому нужен email или телефон.
  const client: Record<string, string> = {};
  if (input.customerEmail) client.email = input.customerEmail;
  if (input.customerPhone) client.phone = input.customerPhone;
  if (input.customerName) client.name = input.customerName;
  if (!client.email && !client.phone) {
    throw new AtolError("Для чека нужен email или телефон покупателя (тег 1008).");
  }

  return {
    client,
    company: {
      email: process.env.ATOL_COMPANY_EMAIL ?? "",
      sno: process.env.ATOL_COMPANY_SNO ?? "usn_income",
      inn: process.env.ATOL_COMPANY_INN ?? "",
      payment_address: process.env.ATOL_COMPANY_PAYMENT_ADDRESS ?? process.env.PUBLIC_SITE_ORIGIN ?? "",
    },
    items: input.items.map((item) => ({
      name: item.name.slice(0, 128),
      price: money(item.price),
      quantity: item.quantity,
      sum: money(item.sum),
      ...(IS_V5 ? { measure: 0 } : { measurement_unit: "шт" }),
      payment_method: "full_payment",
      payment_object: IS_V5 ? Number(paymentObject) : paymentObject,
      vat: { type: vatType },
    })),
    payments: [{ type: 1, sum: money(input.total) }],
    total: money(input.total),
  };
}

/**
 * Регистрация чека «Приход». Возвращает uuid документа —
 * фискальные реквизиты приходят позже, в колбэке или через report().
 */
export async function registerReceipt(input: AtolRegisterInput): Promise<{ uuid: string }> {
  const body = {
    timestamp: atolTimestamp(),
    external_id: input.externalId,
    ...(input.callbackUrl ? { service: { callback_url: input.callbackUrl } } : {}),
    receipt: buildReceipt(input),
  };

  const send = async (token: string) =>
    fetch(`${BASE_URL}/${GROUP}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Token: token },
      body: JSON.stringify(body),
      cache: "no-store",
    });

  let res = await send(await getToken());
  if (res.status === 401) res = await send(await getToken(true));

  const data = await parseJson(res);
  const uuid = typeof data.uuid === "string" ? data.uuid : "";
  if (!uuid) {
    const err = readError(data);
    throw new AtolError(err?.text ?? `АТОЛ отклонил чек (${res.status})`, err?.code ?? null);
  }
  return { uuid };
}

/** Результат обработки чека: статус и фискальные реквизиты. */
export async function getReceiptReport(uuid: string): Promise<AtolReport> {
  const send = async (token: string) =>
    fetch(`${BASE_URL}/${GROUP}/report/${encodeURIComponent(uuid)}`, {
      headers: { Token: token },
      cache: "no-store",
    });

  let res = await send(await getToken());
  if (res.status === 401) res = await send(await getToken(true));

  const data = await parseJson(res);
  return normalizeReport(data);
}

/** Разбор тела как из report(), так и из POST-колбэка АТОЛ — формат один. */
export function normalizeReport(data: Record<string, unknown>): AtolReport {
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const rawStatus = typeof data.status === "string" ? data.status.toLowerCase() : "wait";
  const status: AtolReceiptStatus =
    rawStatus === "done" || rawStatus === "fail" ? rawStatus : "wait";
  const err = readError(data);
  return {
    status,
    uuid: typeof data.uuid === "string" ? data.uuid : null,
    ofdReceiptUrl: typeof payload.ofd_receipt_url === "string" ? payload.ofd_receipt_url : null,
    fiscalDocumentNumber:
      payload.fiscal_document_number != null ? String(payload.fiscal_document_number) : null,
    errorText: status === "fail" ? (err?.text ?? "Чек не пробит") : null,
    raw: data,
  };
}
