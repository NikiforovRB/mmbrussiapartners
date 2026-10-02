"use client";

import * as React from "react";
import { normalizeColumns, type ColumnState } from "@/lib/column-state";

/**
 * Настройка колонок таблицы, запомненная в браузере. До чтения localStorage
 * (и на сервере) действуют колонки по умолчанию.
 */
export function useStoredColumns<K extends string>(
  storageKey: string,
  defaults: ColumnState<K>[],
): [ColumnState<K>[], (next: ColumnState<K>[]) => void] {
  const [columns, setColumns] = React.useState<ColumnState<K>[]>(defaults);
  const loaded = React.useRef(false);
  const defaultsRef = React.useRef(defaults);
  defaultsRef.current = defaults;

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setColumns(normalizeColumns(defaultsRef.current, JSON.parse(saved)));
    } catch {
      // Повреждённая настройка — остаёмся на колонках по умолчанию.
    }
    loaded.current = true;
  }, [storageKey]);

  React.useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(columns));
    } catch {
      // Приватный режим браузера — настройка просто не запомнится.
    }
  }, [columns, storageKey]);

  return [columns, setColumns];
}
