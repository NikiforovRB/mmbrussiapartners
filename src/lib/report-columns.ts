/**
 * Колонки отчёта по лицензиям. Один список для экрана и XLSX: пользователь
 * выбирает видимые колонки и их порядок, выгрузка повторяет его выбор.
 */

export type ReportScope = "dealer" | "admin";

export const REPORT_COLUMNS = [
  { key: "number", label: "Номер", width: 22 },
  { key: "createdAt", label: "Создана", width: 18 },
  { key: "type", label: "Тип", width: 20 },
  { key: "product", label: "Продукт", width: 22 },
  { key: "bundle", label: "Комплектация", width: 14 },
  { key: "productRegion", label: "Регион продукта", width: 14, hidden: true },
  { key: "versionSoftware", label: "Версия ПО", width: 30, hidden: true },
  { key: "versionCustom", label: "Версия кастома", width: 16 },
  { key: "price", label: "Цена", width: 14, money: true },
  { key: "basePrice", label: "Базовая цена", width: 14, money: true, adminOnly: true },
  { key: "margin", label: "Маржа", width: 14, money: true, adminOnly: true, hidden: true },
  { key: "payment", label: "Оплата", width: 16 },
  { key: "issuedWithoutPayment", label: "Без оплаты", width: 12, hidden: true },
  { key: "status", label: "Статус", width: 14 },
  { key: "dealer", label: "Представитель", width: 28, hiddenFor: "dealer" },
  { key: "dealerEmail", label: "Email представителя", width: 26, hidden: true },
  { key: "dealerComment", label: "Комментарий дилера", width: 30 },
  { key: "region", label: "Регион", width: 18, hidden: true },
  { key: "city", label: "Город", width: 18 },
] as const satisfies readonly {
  key: string;
  label: string;
  width: number;
  money?: boolean;
  adminOnly?: boolean;
  hidden?: boolean;
  hiddenFor?: ReportScope;
}[];

export type ReportColumnKey = (typeof REPORT_COLUMNS)[number]["key"];
export type ReportColumnDef = (typeof REPORT_COLUMNS)[number];

export type ReportColumnState = { key: ReportColumnKey; visible: boolean };

const BY_KEY = new Map<string, ReportColumnDef>(REPORT_COLUMNS.map((c) => [c.key, c]));

export function reportColumn(key: ReportColumnKey): ReportColumnDef {
  return BY_KEY.get(key)!;
}

/** Колонки, доступные в этом контексте: базовая цена и маржа — только админам. */
export function availableColumns(scope: ReportScope): ReportColumnDef[] {
  return REPORT_COLUMNS.filter((c) => scope === "admin" || !("adminOnly" in c && c.adminOnly));
}

export function defaultColumnState(scope: ReportScope): ReportColumnState[] {
  return availableColumns(scope).map((c) => ({
    key: c.key,
    visible: !("hidden" in c && c.hidden) && !("hiddenFor" in c && c.hiddenFor === scope),
  }));
}

/**
 * Сохранённое состояние колонок приводится к актуальному списку: неизвестные
 * и недоступные колонки выбрасываются, новые добавляются в конец со своим
 * значением видимости по умолчанию.
 */
export function normalizeColumnState(scope: ReportScope, saved: unknown): ReportColumnState[] {
  const defaults = defaultColumnState(scope);
  if (!Array.isArray(saved)) return defaults;
  const allowed = new Map(defaults.map((c) => [c.key, c]));
  const result: ReportColumnState[] = [];
  for (const item of saved) {
    if (!item || typeof item !== "object") continue;
    const key = (item as { key?: unknown }).key;
    if (typeof key !== "string" || !allowed.has(key as ReportColumnKey)) continue;
    if (result.some((c) => c.key === key)) continue;
    result.push({ key: key as ReportColumnKey, visible: (item as { visible?: unknown }).visible !== false });
  }
  for (const c of defaults) if (!result.some((r) => r.key === c.key)) result.push(c);
  return result;
}

/** Ключи колонок для выгрузки: только известные и доступные в контексте. */
export function sanitizeColumnKeys(scope: ReportScope, keys: readonly string[] | undefined): ReportColumnKey[] {
  const allowed = new Set<string>(availableColumns(scope).map((c) => c.key));
  const picked = (keys ?? []).filter((k, i, arr) => allowed.has(k) && arr.indexOf(k) === i) as ReportColumnKey[];
  if (picked.length > 0) return picked;
  return defaultColumnState(scope)
    .filter((c) => c.visible)
    .map((c) => c.key);
}

/** Строка отчёта: одинаковая для предпросмотра и XLSX. */
export type ReportRow = {
  id: string;
  number: string;
  createdAt: string;
  type: string;
  product: string;
  bundle: string;
  productRegion: string;
  versionSoftware: string;
  versionCustom: string;
  price: number | null;
  basePrice?: number | null;
  margin?: number | null;
  payment: string;
  paymentStatus: string | null;
  issuedWithoutPayment: boolean;
  status: string;
  statusLabel: string;
  dealer: string;
  dealerEmail: string;
  dealerComment: string;
  region: string;
  city: string;
};
