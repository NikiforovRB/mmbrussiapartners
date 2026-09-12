import "server-only";
import { isAtolConfigured, atolMissingEnv } from "./atol";
import { defaultLicensePrice } from "./provider";

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
  };
  fiscalization: {
    configured: boolean;
    missingEnv: string[];
    protocol: "v4 (ФФД 1.05)" | "v5 (ФФД 1.2)";
    baseUrl: string;
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

export function getPaymentSettingsSummary(): PaymentSettingsSummary {
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
    },
    fiscalization: {
      configured: isAtolConfigured(),
      missingEnv: atolMissingEnv(),
      protocol: isV5 ? "v5 (ФФД 1.2)" : "v4 (ФФД 1.05)",
      baseUrl,
      company: {
        inn: process.env.ATOL_COMPANY_INN ?? "",
        email: process.env.ATOL_COMPANY_EMAIL ?? "",
        sno: process.env.ATOL_COMPANY_SNO ?? "usn_income",
        vatType: process.env.ATOL_VAT_TYPE || "none",
        paymentObject: process.env.ATOL_PAYMENT_OBJECT ?? (isV5 ? "4" : "service"),
        paymentAddress:
          process.env.ATOL_COMPANY_PAYMENT_ADDRESS ?? process.env.PUBLIC_SITE_ORIGIN ?? "",
      },
      webhookConfigured: Boolean(process.env.ATOL_WEBHOOK_SECRET),
    },
    pricing: {
      defaultLicensePrice: defaultLicensePrice(),
      bundlePrices: parseBundlePrices(process.env.PAYMENT_BUNDLE_PRICES),
    },
  };
}
