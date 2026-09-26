/** Подписи для обмена с «Дилерской сетью» mmbrussia.ru — общие для сервера и клиента. */

export type SitePublication = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export const SITE_RESULT_LABEL: Record<string, string> = {
  created: "создано",
  linked: "связано",
  updated: "обновлено",
  unchanged: "без изменений",
  removed: "удалено",
  conflict: "конфликт",
  error: "ошибка",
  failed: "не доставлено",
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
  delete: "представитель удалён",
  daily: "ежедневная",
  manual: "вручную",
  retry: "повтор",
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
