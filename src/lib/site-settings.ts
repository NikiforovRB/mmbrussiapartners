import { z } from "zod";

/**
 * Настройки сайта, редактируемые администратором и хранящиеся в CompanySettings:
 * объявление под шапкой кабинета и раздел «Техподдержка».
 */

// ── Объявление под шапкой ──────────────────────────────────────────────────
export const announcementSchema = z.object({
  enabled: z.boolean(),
  text: z.string().max(500),
  /** Обновляется при каждом сохранении: по нему дилер снова видит закрытое объявление. */
  updatedAt: z.string().optional().nullable(),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const DEFAULT_ANNOUNCEMENT: Announcement = {
  enabled: false,
  text: "",
  updatedAt: null,
};

export function mergeAnnouncement(raw: unknown): Announcement {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ANNOUNCEMENT };
  const d = raw as Partial<Announcement>;
  return {
    enabled: Boolean(d.enabled),
    text: typeof d.text === "string" ? d.text : "",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : null,
  };
}

// ── Техподдержка ────────────────────────────────────────────────────────────
export const supportChannelSchema = z.object({
  label: z.string().min(1, "Укажите название").max(80),
  url: z.string().min(1, "Укажите ссылку").max(500),
  /** Ключ пресет-иконки (lucide), если не заданы картинки. */
  icon: z.string().max(40).optional().nullable(),
  /** Ссылка на картинку-иконку (обычное состояние). */
  iconUrl: z.string().max(500).optional().nullable(),
  /** Ссылка на картинку-иконку при наведении. */
  iconHoverUrl: z.string().max(500).optional().nullable(),
});
export type SupportChannel = z.infer<typeof supportChannelSchema>;

export const supportSettingsSchema = z.object({
  intro: z.string().max(500).optional().nullable(),
  requirements: z.string().max(2000).optional().nullable(),
  channels: z.array(supportChannelSchema).max(30),
});
export type SupportSettings = z.infer<typeof supportSettingsSchema>;

export const DEFAULT_SUPPORT: SupportSettings = {
  intro: "",
  requirements: "",
  channels: [],
};

/** Пресет-иконки, доступные в настройках канала связи. */
export const SUPPORT_ICON_OPTIONS = [
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Телефон" },
  { value: "mail", label: "Почта" },
  { value: "message", label: "Чат" },
  { value: "help", label: "Поддержка" },
  { value: "link", label: "Ссылка" },
] as const;

// ── Ограничения генерации ────────────────────────────────────────────────────
export const generationSettingsSchema = z.object({
  /** Запрет генерации в заданный период (техработы, стоп-продажи и т.п.). */
  blackoutEnabled: z.boolean(),
  /** Локальное время начала/конца в формате datetime-local (YYYY-MM-DDTHH:mm). */
  blackoutStart: z.string().max(40).optional().nullable(),
  blackoutEnd: z.string().max(40).optional().nullable(),
  blackoutMessage: z.string().max(300).optional().nullable(),
  /** Устаревшие версии кастома, для которых генерация запрещена. */
  blockedCustomVersions: z.array(z.string().max(100)).max(500),
  customVersionMessage: z.string().max(300).optional().nullable(),
});
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  blackoutEnabled: false,
  blackoutStart: null,
  blackoutEnd: null,
  blackoutMessage: "",
  blockedCustomVersions: [],
  customVersionMessage: "",
};

export function mergeGenerationSettings(raw: unknown): GenerationSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GENERATION_SETTINGS, blockedCustomVersions: [] };
  const d = raw as Partial<GenerationSettings>;
  return {
    blackoutEnabled: Boolean(d.blackoutEnabled),
    blackoutStart: typeof d.blackoutStart === "string" ? d.blackoutStart : null,
    blackoutEnd: typeof d.blackoutEnd === "string" ? d.blackoutEnd : null,
    blackoutMessage: typeof d.blackoutMessage === "string" ? d.blackoutMessage : "",
    blockedCustomVersions: Array.isArray(d.blockedCustomVersions)
      ? d.blockedCustomVersions.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [],
    customVersionMessage: typeof d.customVersionMessage === "string" ? d.customVersionMessage : "",
  };
}

/**
 * Проверяет ограничения генерации. Возвращает причину отказа или null, если
 * генерация разрешена. Время blackout трактуется как локальное время сервера
 * (datetime-local без таймзоны).
 */
export function generationBlockReason(
  settings: GenerationSettings,
  versionCustom: string,
): string | null {
  if (settings.blackoutEnabled) {
    const now = Date.now();
    const start = settings.blackoutStart ? Date.parse(settings.blackoutStart) : NaN;
    const end = settings.blackoutEnd ? Date.parse(settings.blackoutEnd) : NaN;
    const afterStart = Number.isNaN(start) || now >= start;
    const beforeEnd = Number.isNaN(end) || now <= end;
    // Если обе границы пустые — считаем запрет постоянным (пока включён тумблер).
    if (afterStart && beforeEnd) {
      return (
        (settings.blackoutMessage?.trim() ||
          "Генерация временно недоступна (технические работы). Попробуйте позже.")
      );
    }
  }

  const v = versionCustom.trim().toLowerCase();
  if (v && settings.blockedCustomVersions.some((b) => b.trim().toLowerCase() === v)) {
    return (
      settings.customVersionMessage?.trim() ||
      "Версия кастома устарела. Обновите кастом до актуальной версии и повторите генерацию."
    );
  }

  return null;
}

// ── Онлайн-оплата ────────────────────────────────────────────────────────────
/**
 * Наименование услуги в чеке (тег 1030), ставка НДС и признак способа расчёта.
 * Секреты кассы/эквайринга здесь НЕ хранятся — они в .env.
 */
export const PAYMENT_VAT_OPTIONS = [
  { value: "none", label: "Без НДС" },
  { value: "vat0", label: "НДС 0%" },
  { value: "vat5", label: "НДС 5%" },
  { value: "vat7", label: "НДС 7%" },
  { value: "vat10", label: "НДС 10%" },
  { value: "vat20", label: "НДС 20%" },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "full_payment", label: "Полный расчёт (полная оплата)" },
  { value: "full_prepayment", label: "Полная предоплата" },
  { value: "prepayment", label: "Частичная предоплата" },
  { value: "advance", label: "Аванс" },
] as const;

export type PaymentVatType = (typeof PAYMENT_VAT_OPTIONS)[number]["value"];
export type PaymentMethodType = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];

const VAT_VALUES = PAYMENT_VAT_OPTIONS.map((o) => o.value) as [PaymentVatType, ...PaymentVatType[]];
const METHOD_VALUES = PAYMENT_METHOD_OPTIONS.map((o) => o.value) as [
  PaymentMethodType,
  ...PaymentMethodType[],
];

export const paymentSettingsSchema = z.object({
  /** Наименование услуги в фискальном чеке (тег 1030). */
  serviceLabel: z.string().min(1, "Укажите наименование услуги").max(200),
  /** Ставка НДС (тег 1199). */
  vatType: z.enum(VAT_VALUES),
  /** Признак способа расчёта (тег 1214). */
  paymentMethod: z.enum(METHOD_VALUES),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  serviceLabel: "Услуга по модификации программного обеспечения",
  vatType: "vat5",
  paymentMethod: "full_payment",
};

export function mergePaymentSettings(raw: unknown): PaymentSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PAYMENT_SETTINGS };
  const d = raw as Partial<PaymentSettings>;
  const vatType = VAT_VALUES.includes(d.vatType as PaymentVatType)
    ? (d.vatType as PaymentVatType)
    : DEFAULT_PAYMENT_SETTINGS.vatType;
  const paymentMethod = METHOD_VALUES.includes(d.paymentMethod as PaymentMethodType)
    ? (d.paymentMethod as PaymentMethodType)
    : DEFAULT_PAYMENT_SETTINGS.paymentMethod;
  const serviceLabel =
    typeof d.serviceLabel === "string" && d.serviceLabel.trim()
      ? d.serviceLabel.trim().slice(0, 200)
      : DEFAULT_PAYMENT_SETTINGS.serviceLabel;
  return { serviceLabel, vatType, paymentMethod };
}

export function mergeSupport(raw: unknown): SupportSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SUPPORT, channels: [] };
  const d = raw as Partial<SupportSettings>;
  const channels = Array.isArray(d.channels)
    ? d.channels
        .filter((c): c is SupportChannel => Boolean(c && typeof c === "object"))
        .map((c) => ({
          label: typeof c.label === "string" ? c.label : "",
          url: typeof c.url === "string" ? c.url : "",
          icon: typeof c.icon === "string" ? c.icon : null,
          iconUrl: typeof c.iconUrl === "string" ? c.iconUrl : null,
          iconHoverUrl: typeof c.iconHoverUrl === "string" ? c.iconHoverUrl : null,
        }))
    : [];
  return {
    intro: typeof d.intro === "string" ? d.intro : "",
    requirements: typeof d.requirements === "string" ? d.requirements : "",
    channels,
  };
}
