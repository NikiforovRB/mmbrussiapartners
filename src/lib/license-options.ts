// Единственный тип лицензии — «Генерация». Повторная выдача по тому же ШГУ
// отмечается флагом repeatGeneration, а не отдельным типом.
export const LICENSE_TYPES = ["Генерация"] as const;

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

// Фильтр списка лицензий по «виду»: обычная генерация или повторная. Отдельного
// типа «Повторная генерация» в базе нет — это флаг repeatGeneration, поэтому
// значения фильтра синтетические (gen/repeat), а не поле type.
export const LICENSE_KIND_FILTER_OPTIONS = [
  { value: "", label: "Все типы лицензий" },
  { value: "gen", label: "Генерация" },
  { value: "repeat", label: "Повторная генерация" },
];
