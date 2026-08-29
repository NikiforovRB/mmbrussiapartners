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
