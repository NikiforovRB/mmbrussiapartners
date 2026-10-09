import type { ColumnState } from "./column-state";

/** Колонки таблицы «Лицензии». «Действия» не настраиваются и всегда стоят последними. */
export const LICENSE_TABLE_COLUMNS = [
  { key: "number", label: "Номер" },
  { key: "createdAt", label: "Дата" },
  { key: "type", label: "Тип" },
  { key: "product", label: "Продукт" },
  { key: "dealer", label: "Дилер", adminOnly: true },
  { key: "dealerComment", label: "Комментарий дилера" },
  { key: "status", label: "Статус" },
  { key: "versionSoftware", label: "Версия ПО" },
  { key: "versionCustom", label: "Версия кастома", hidden: true },
  { key: "price", label: "Стоимость", hidden: true },
  { key: "payment", label: "Оплата" },
] as const satisfies readonly { key: string; label: string; adminOnly?: boolean; hidden?: boolean }[];

export type LicenseColumnKey = (typeof LICENSE_TABLE_COLUMNS)[number]["key"];

const LABELS = new Map<string, string>(LICENSE_TABLE_COLUMNS.map((c) => [c.key, c.label]));

export function licenseColumnLabel(key: LicenseColumnKey): string {
  return LABELS.get(key) ?? key;
}

export function defaultLicenseColumns(context: "dealer" | "admin"): ColumnState<LicenseColumnKey>[] {
  return LICENSE_TABLE_COLUMNS.filter((c) => context === "admin" || !("adminOnly" in c && c.adminOnly)).map(
    (c) => ({ key: c.key, visible: !("hidden" in c && c.hidden) }),
  );
}
