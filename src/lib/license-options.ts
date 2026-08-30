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
