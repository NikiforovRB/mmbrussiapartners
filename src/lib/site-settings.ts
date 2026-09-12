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
