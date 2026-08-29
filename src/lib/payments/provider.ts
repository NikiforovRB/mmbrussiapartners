import "server-only";

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
  amount: number;
  description: string;
  email?: string | null;
  phone?: string | null;
  returnUrl: string;
};

export type CheckoutResult = {
  externalId: string;
  /** Куда отправить дилера. Для manual — внутренняя страница счёта. */
  payUrl: string;
  /** true — деньги придут мимо портала, оплату подтверждает администратор. */
  requiresManualConfirmation: boolean;
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

const atolPayProvider: PaymentProvider = {
  id: "atol_pay",
  title: "АТОЛ Pay",
  isConfigured: () => Boolean(process.env.ATOL_PAY_API_TOKEN),
  missingEnv: () => (process.env.ATOL_PAY_API_TOKEN ? [] : ["ATOL_PAY_API_TOKEN"]),
  async createCheckout(input) {
    const token = process.env.ATOL_PAY_API_TOKEN;
    if (!token) {
      throw new Error(
        "АТОЛ Pay не настроен: получите API-токен в личном кабинете АТОЛ Pay и задайте ATOL_PAY_API_TOKEN.",
      );
    }
    const base = (process.env.ATOL_PAY_BASE_URL ?? "https://api.pay.atol.ru").replace(/\/+$/, "");
    const res = await fetch(`${base}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        order_id: input.paymentId,
        amount: input.amount,
        currency: "RUB",
        description: input.description,
        customer: { email: input.email ?? undefined, phone: input.phone ?? undefined },
        success_url: input.returnUrl,
        fail_url: input.returnUrl,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const payUrl = typeof data.payment_url === "string" ? data.payment_url : "";
    if (!res.ok || !payUrl) {
      throw new Error(
        typeof data.message === "string"
          ? data.message
          : `АТОЛ Pay не вернул ссылку на оплату (${res.status})`,
      );
    }
    return {
      externalId: typeof data.id === "string" ? data.id : input.paymentId,
      payUrl,
      requiresManualConfirmation: false,
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

/** Цена генерации одной лицензии по умолчанию. */
export function defaultLicensePrice(): number {
  const raw = Number(process.env.PAYMENT_LICENSE_PRICE ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
