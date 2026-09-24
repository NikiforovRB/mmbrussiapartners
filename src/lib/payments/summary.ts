import "server-only";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_VAT_OPTIONS,
  type PaymentSettings,
} from "@/lib/site-settings";
import { isAtolConfigured, atolMissingEnv } from "./atol";
import { atolPayPaymentMethods, defaultLicensePrice } from "./provider";

const PAYMENT_TYPE_TITLES: Record<string, string> = {
  card: "Карта",
  bank_app: "Приложение банка",
  sbp: "СБП",
  bnpl: "Рассрочка",
  account: "По счёту",
};
const BANK_TITLES: Record<number, string> = {
  100: "Альфа-Банк",
  300: "Райффайзен",
  400: "Сбербанк",
  401: "SberPay QR",
  500: "НСПК",
  600: "ЮКасса",
  700: "Т-Банк",
  701: "Т-Банк Долями",
  900: "ГПБ",
};

function vatLabel(value: string): string {
  return PAYMENT_VAT_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
function methodLabel(value: string): string {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Безопасная сводка настроек онлайн-оплаты для админки: показывает, что и как
 * настроено, но НЕ раскрывает секреты (логины, пароли, токены, ключи вебхука).
 * Значения секретов задаются на сервере в .env и не редактируются из браузера.
 */
export type PaymentSettingsSummary = {
  acquiring: {
    configuredProvider: string;
    activeProvider: string;
    atolPayConfigured: boolean;
    /** Способы оплаты на форме АТОЛ Pay; пусто — из настроек ЛК АТОЛ Pay. */
    paymentMethods: string[];
    webhookConfigured: boolean;
  };
  fiscalization: {
    configured: boolean;
    missingEnv: string[];
    protocol: "v4 (ФФД 1.05)" | "v5 (ФФД 1.2)";
    baseUrl: string;
    /** Наименование услуги в чеке (тег 1030) — из настроек оплаты. */
    serviceLabel: string;
    /** Способ расчёта (тег 1214) — из настроек оплаты. */
    paymentMethod: string;
    company: {
      inn: string;
      email: string;
      sno: string;
      vatType: string;
      paymentObject: string;
      paymentAddress: string;
    };
    webhookConfigured: boolean;
  };
  /** Отправка чека дилеру по почте (SMTP). */
  receiptEmail: {
    smtpConfigured: boolean;
    from: string;
  };
  pricing: {
    defaultLicensePrice: number;
    bundlePrices: Record<string, number>;
  };
};

function parseBundlePrices(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const price = Number(value);
      if (Number.isFinite(price) && price >= 0) map[key.trim().toUpperCase()] = price;
    }
    return map;
  } catch {
    return {};
  }
}

export function getPaymentSettingsSummary(payment: PaymentSettings): PaymentSettingsSummary {
  const configuredProvider = (process.env.PAYMENT_PROVIDER ?? "manual").trim();
  const atolPayConfigured = Boolean(process.env.ATOL_PAY_API_TOKEN);
  const activeProvider =
    configuredProvider === "atol_pay" && atolPayConfigured ? "atol_pay" : "manual";

  const baseUrl = (process.env.ATOL_BASE_URL ?? "https://online.atol.ru/possystem/v4").replace(/\/+$/, "");
  const isV5 = /\/v5$/.test(baseUrl);

  return {
    acquiring: {
      configuredProvider,
      activeProvider,
      atolPayConfigured,
      paymentMethods: atolPayPaymentMethods().map(
        (m) =>
          `${PAYMENT_TYPE_TITLES[m.paymentType] ?? m.paymentType} (${BANK_TITLES[m.bankId] ?? m.bankId})`,
      ),
      webhookConfigured: Boolean(process.env.ATOL_PAY_WEBHOOK_SECRET || process.env.ATOL_WEBHOOK_SECRET),
    },
    fiscalization: {
      configured: isAtolConfigured(),
      missingEnv: atolMissingEnv(),
      protocol: isV5 ? "v5 (ФФД 1.2)" : "v4 (ФФД 1.05)",
      baseUrl,
      serviceLabel: payment.serviceLabel,
      paymentMethod: methodLabel(payment.paymentMethod),
      company: {
        inn: process.env.ATOL_COMPANY_INN ?? "",
        email: process.env.ATOL_COMPANY_EMAIL ?? "",
        sno: process.env.ATOL_COMPANY_SNO ?? "usn_income",
        vatType: vatLabel(payment.vatType),
        paymentObject: process.env.ATOL_PAYMENT_OBJECT ?? (isV5 ? "4" : "service"),
        paymentAddress:
          process.env.ATOL_COMPANY_PAYMENT_ADDRESS ?? process.env.PUBLIC_SITE_ORIGIN ?? "",
      },
      webhookConfigured: Boolean(process.env.ATOL_WEBHOOK_SECRET),
    },
    receiptEmail: {
      smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      from: process.env.SMTP_FROM ?? "MMB RUSSIA <noreply@mmbrussia.ru>",
    },
    pricing: {
      defaultLicensePrice: defaultLicensePrice(),
      bundlePrices: parseBundlePrices(process.env.PAYMENT_BUNDLE_PRICES),
    },
  };
}
