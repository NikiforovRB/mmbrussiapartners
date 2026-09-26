import "server-only";
import { fetchWithTimeout } from "@/lib/http";

/**
 * Приём оплаты (эквайринг).
 *
 * АТОЛ Онлайн — это касса: она печатает чек, но денег не принимает.
 * За списание с карты отвечает отдельный сервис, поэтому эквайринг
 * вынесен за интерфейс: касса подключается один раз и работает
 * с любым провайдером.
 *
 *   manual   — счёт на оплату (перевод / СБП по реквизитам),
 *              факт поступления подтверждает администратор;
 *   atol_pay — платёжные ссылки АТОЛ Pay (нужен API-токен из ЛК АТОЛ Pay).
 */

export type PaymentProviderId = "manual" | "atol_pay";

export type CheckoutInput = {
  paymentId: string;
  /** Номер заказа у эквайринга. По умолчанию — id платежа; у перевыпущенной ссылки свой. */
  orderId?: string;
  amount: number;
  description: string;
  email?: string | null;
  phone?: string | null;
  returnUrl: string;
  /** Адрес для callback АТОЛ Pay о смене статуса оплаты (если задан секрет). */
  notifyUrl?: string | null;
};

export type CheckoutResult = {
  externalId: string;
  /** Куда отправить дилера. Для manual — внутренняя страница счёта. */
  payUrl: string;
  /** true — деньги придут мимо портала, оплату подтверждает администратор. */
  requiresManualConfirmation: boolean;
  /** Сумма заказа в копейках, как её зарегистрировал эквайринг. */
  amountMinor?: number;
};

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly title: string;
  isConfigured(): boolean;
  missingEnv(): string[];
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
}

const manualProvider: PaymentProvider = {
  id: "manual",
  title: "Счёт на оплату",
  isConfigured: () => true,
  missingEnv: () => [],
  async createCheckout(input) {
    return {
      externalId: `inv_${input.paymentId}`,
      payUrl: `/dealer/payments/${input.paymentId}`,
      requiresManualConfirmation: true,
    };
  },
};

/** Достаёт человекочитаемый текст ошибки из ответа АТОЛ Pay. */
function readAtolPayError(data: Record<string, unknown>): string | null {
  const err = data.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.text === "string") return e.text;
  }
  if (typeof data.errorMessage === "string") return data.errorMessage;
  if (typeof data.message === "string") return data.message;
  return null;
}

function atolPayBase(): string {
  return (process.env.ATOL_PAY_BASE_URL || "https://new-api-mobile.atolpay.ru/v1/ecom").replace(/\/+$/, "");
}

function atolPayAuthorization(token: string): string {
  return /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
}

function atolPayTimeout(): number {
  return Number(process.env.ATOL_PAY_TIMEOUT_MS ?? 20_000);
}

type AtolPayMethod = { paymentType: string; bankId: number };

/**
 * Способы оплаты на форме АТОЛ Pay из ATOL_PAY_PAYMENT_METHODS в виде
 * "card:700,bank_app:700,sbp:600" (тип:банк). Пусто — берутся из ЛК АТОЛ Pay
 * (Настройки → Настройки заказов); если и там не заданы, заказ не создастся.
 */
export function atolPayPaymentMethods(): AtolPayMethod[] {
  return (process.env.ATOL_PAY_PAYMENT_METHODS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [paymentType, bankId] = part.split(":").map((s) => s.trim());
      return { paymentType, bankId: Number(bankId) };
    })
    .filter((m) => m.paymentType && Number.isInteger(m.bankId));
}

const METHOD_PHRASES: Record<string, string> = {
  card: "картой",
  bank_app: "через T-Pay",
  sbp: "по СБП",
  bnpl: "в рассрочку",
  account: "по счёту",
};

/** «картой или через T-Pay» — для подсказок дилеру; null, если способы берутся из ЛК. */
export function atolPayMethodsPhrase(): string | null {
  const phrases = [
    ...new Set(atolPayPaymentMethods().map((m) => METHOD_PHRASES[m.paymentType]).filter(Boolean)),
  ];
  if (phrases.length === 0) return null;
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(", ")} или ${phrases[phrases.length - 1]}`;
}

/** Коды статуса заказа АТОЛ Pay (GET /payments/{orderId}/status). */
export const ATOL_PAY_STATUS = {
  processing: 0,
  success: 1,
  canceled: 4,
  refunded: 5,
  paymentIsOverdue: 9,
  confirm3ds: 10,
} as const;

export type AtolPayOrderStatus = { code: number; message: string };

/** Статус заказа в АТОЛ Pay; null — такого заказа у АТОЛ Pay нет. */
export async function getAtolPayOrderStatus(orderId: string): Promise<AtolPayOrderStatus | null> {
  const token = process.env.ATOL_PAY_API_TOKEN;
  if (!token) throw new Error("АТОЛ Pay не настроен (ATOL_PAY_API_TOKEN)");
  const res = await fetchWithTimeout(`${atolPayBase()}/payments/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: atolPayAuthorization(token) },
    timeoutMs: atolPayTimeout(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (data.errorCode === "ORDER_NOT_FOUND") return null;
  const payload = (data.data && typeof data.data === "object" ? data.data : {}) as Record<string, unknown>;
  if (!res.ok || data.status !== "success" || typeof payload.status !== "number") {
    throw new Error(readAtolPayError(data) ?? `АТОЛ Pay не вернул статус заказа (${res.status})`);
  }
  return {
    code: payload.status,
    message: typeof payload.statusMessage === "string" ? payload.statusMessage : "",
  };
}

/**
 * АТОЛ Pay Ecom (интернет-эквайринг). Регистрируем платёж методом
 * POST /v1/ecom/payments и перенаправляем дилера на paymentUrls.main.
 * Токен из ЛК АТОЛ Pay (https://lk.atolpay.ru/, Настройки → API Токены)
 * передаётся в заголовке Authorization: Bearer {token}. Сумма — в копейках.
 * Документация: https://new-api-mobile.atolpay.ru/v1/ecom/documentation/
 */
const atolPayProvider: PaymentProvider = {
  id: "atol_pay",
  title: "АТОЛ Pay",
  isConfigured: () => Boolean(process.env.ATOL_PAY_API_TOKEN),
  missingEnv: () => (process.env.ATOL_PAY_API_TOKEN ? [] : ["ATOL_PAY_API_TOKEN"]),
  async createCheckout(input) {
    const token = process.env.ATOL_PAY_API_TOKEN;
    if (!token) {
      throw new Error(
        "АТОЛ Pay не настроен: получите токен в личном кабинете АТОЛ Pay и задайте ATOL_PAY_API_TOKEN.",
      );
    }
    const orderId = input.orderId ?? input.paymentId;
    const paymentMethods = atolPayPaymentMethods();
    const amountMinor = Math.round(input.amount * 100); // сумма в копейках
    const res = await fetchWithTimeout(`${atolPayBase()}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: atolPayAuthorization(token),
      },
      timeoutMs: atolPayTimeout(),
      body: JSON.stringify({
        amount: amountMinor,
        orderId,
        sessionType: "oneStep",
        ...(paymentMethods.length > 0 ? { paymentMethods } : {}),
        additionalProps: {
          returnUrl: input.returnUrl,
          ...(input.notifyUrl ? { notificationUrl: input.notifyUrl } : {}),
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = (data.data && typeof data.data === "object" ? data.data : {}) as Record<string, unknown>;
    const urls = (payload.paymentUrls && typeof payload.paymentUrls === "object"
      ? payload.paymentUrls
      : {}) as Record<string, unknown>;
    const payUrl = typeof urls.main === "string" ? urls.main : "";
    if (!res.ok || data.status !== "success" || !payUrl) {
      throw new Error(readAtolPayError(data) ?? `АТОЛ Pay не вернул ссылку на оплату (${res.status})`);
    }
    return {
      externalId: typeof payload.orderId === "string" ? payload.orderId : orderId,
      payUrl,
      requiresManualConfirmation: false,
      amountMinor: typeof payload.amount === "number" ? payload.amount : amountMinor,
    };
  },
};

const providers: Record<PaymentProviderId, PaymentProvider> = {
  manual: manualProvider,
  atol_pay: atolPayProvider,
};

export function getPaymentProvider(): PaymentProvider {
  const id = (process.env.PAYMENT_PROVIDER ?? "manual") as PaymentProviderId;
  const provider = providers[id];
  if (!provider || !provider.isConfigured()) return manualProvider;
  return provider;
}

/** Цена генерации одной лицензии, когда комплектация неизвестна. */
export function defaultLicensePrice(): number {
  const raw = Number(process.env.PAYMENT_LICENSE_PRICE ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Прайс по комплектациям: у одного продукта FULL и ECO стоят по-разному.
 * Переопределяется PAYMENT_BUNDLE_PRICES в виде {"FULL":10000,"ECO":6000}.
 */
const DEFAULT_BUNDLE_PRICES: Record<string, number> = { FULL: 10000, ECO: 6000 };

function bundlePrices(): Record<string, number> {
  const raw = process.env.PAYMENT_BUNDLE_PRICES;
  if (!raw) return DEFAULT_BUNDLE_PRICES;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const price = Number(value);
      if (Number.isFinite(price) && price >= 0) map[key.trim().toUpperCase()] = price;
    }
    return Object.keys(map).length > 0 ? map : DEFAULT_BUNDLE_PRICES;
  } catch {
    console.error("[payments] PAYMENT_BUNDLE_PRICES не разобран, взят прайс по умолчанию");
    return DEFAULT_BUNDLE_PRICES;
  }
}

/** Цена лицензии для комплектации; для неизвестной — общая цена. */
export function licensePrice(bundle?: string | null): number {
  const key = (bundle ?? "").trim().toUpperCase();
  if (!key) return defaultLicensePrice();
  const price = bundlePrices()[key];
  return price === undefined ? defaultLicensePrice() : price;
}
