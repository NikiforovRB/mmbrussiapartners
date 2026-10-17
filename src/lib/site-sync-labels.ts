/** Подписи для обмена с «Дилерской сетью» mmbrussia.ru — общие для сервера и клиента. */

export type SitePublication = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/** Запись «Дилерской сети» с телефоном дилера, как её видел кабинет при последней проверке. */
export type SiteEntry = {
  id: string;
  city: string;
  phone: string;
  comment: string | null;
  /** Запись связана с этим дилером; иначе её добавили в админке сайта и кабинет её не ведёт. */
  linked: boolean;
};

export function readSiteEntries(value: unknown): SiteEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      id: String(e.id ?? ""),
      city: String(e.city ?? ""),
      phone: String(e.phone ?? ""),
      comment: typeof e.comment === "string" && e.comment.trim() ? e.comment : null,
      linked: e.linked === true,
    }));
}

/** Подпись при сравнении кабинета с сайтом: пустая и отсутствующая — одно и то же. */
export function sameSiteComment(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

export const SITE_RESULT_LABEL: Record<string, string> = {
  created: "создано",
  linked: "связано",
  updated: "обновлено",
  unchanged: "без изменений",
  removed: "удалено",
  conflict: "конфликт",
  error: "ошибка",
  failed: "не доставлено",
  adopted: "взято с сайта",
};

export const SITE_ACTION_LABEL: Record<string, string> = {
  upsert: "Публикация",
  remove: "Снятие",
  sync: "Сверка",
};

export const SITE_TRIGGER_LABEL: Record<string, string> = {
  profile: "изменён профиль",
  publication: "модерация",
  status: "статус учётной записи",
  delete: "дилер удалён",
  daily: "ежедневная",
  manual: "вручную",
  retry: "повтор",
  site: "изменения на сайте",
};

/** Статусы строки ответа сайта, о которых стоит предупредить администратора. */
export const SITE_PROBLEM_STATUSES = ["failed", "conflict", "error"];

export function formatSiteSummary(summary: Record<string, number> | null | undefined): string {
  if (!summary) return "";
  return Object.entries(summary)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([k, n]) => `${SITE_RESULT_LABEL[k] ?? k}: ${n}`)
    .join(", ");
}
