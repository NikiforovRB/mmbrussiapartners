/** Видимость и порядок колонок таблицы, которые пользователь настраивает сам. */
export type ColumnState<K extends string = string> = { key: K; visible: boolean };

/**
 * Сохранённое состояние колонок приводится к актуальному списку: неизвестные
 * и недоступные колонки выбрасываются, новые добавляются в конец со своим
 * значением видимости по умолчанию.
 */
export function normalizeColumns<K extends string>(defaults: ColumnState<K>[], saved: unknown): ColumnState<K>[] {
  if (!Array.isArray(saved)) return defaults;
  const allowed = new Set<string>(defaults.map((c) => c.key));
  const result: ColumnState<K>[] = [];
  for (const item of saved) {
    if (!item || typeof item !== "object") continue;
    const key = (item as { key?: unknown }).key;
    if (typeof key !== "string" || !allowed.has(key)) continue;
    if (result.some((c) => c.key === key)) continue;
    result.push({ key: key as K, visible: (item as { visible?: unknown }).visible !== false });
  }
  for (const c of defaults) if (!result.some((r) => r.key === c.key)) result.push(c);
  return result;
}
