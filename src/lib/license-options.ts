export const LICENSE_TYPES = ["Генерация", "Обновление", "Восстановление"] as const;

export type LicenseType = (typeof LICENSE_TYPES)[number];

export function isLicenseType(value: unknown): value is LicenseType {
  return typeof value === "string" && (LICENSE_TYPES as readonly string[]).includes(value);
}

export const LICENSE_TYPE_OPTIONS = LICENSE_TYPES.map((t) => ({ value: t, label: t }));

// Опция «Все типы лицензий» для фильтров
export const LICENSE_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Все типы лицензий" },
  ...LICENSE_TYPE_OPTIONS,
];

/**
 * Срок действия лицензии в месяцах; 0 — бессрочная.
 *
 * В базе бессрочной соответствует termEnd = null: крон истечения такие записи
 * не трогает, и напоминания по ним не уходят.
 */
export const LICENSE_TERMS = [
  { value: 0, label: "Бессрочная" },
  { value: 12, label: "1 год" },
  { value: 24, label: "2 года" },
  { value: 36, label: "3 года" },
] as const;

export type LicenseTermMonths = (typeof LICENSE_TERMS)[number]["value"];

export const LICENSE_TERM_OPTIONS = LICENSE_TERMS.map((t) => ({
  value: String(t.value),
  label: t.label,
}));

export function isLicenseTerm(value: unknown): value is LicenseTermMonths {
  return LICENSE_TERMS.some((t) => t.value === value);
}

/** Дата окончания по числу месяцев; null — бессрочная. */
export function termEndFromMonths(start: Date, months: number): Date | null {
  if (!months) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

export const LICENSE_PLATFORMS = [
  "Android",
  "Linux",
  "QNX",
  "WinCE",
  "Универсальная",
] as const;

export type LicensePlatform = (typeof LICENSE_PLATFORMS)[number];

export function isLicensePlatform(value: unknown): value is LicensePlatform {
  return typeof value === "string" && (LICENSE_PLATFORMS as readonly string[]).includes(value);
}

export const LICENSE_PLATFORM_OPTIONS = LICENSE_PLATFORMS.map((p) => ({ value: p, label: p }));
