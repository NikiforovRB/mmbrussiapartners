"use client";

import * as React from "react";

/** Как часто редактор сохраняет несохранённые правки сам. */
export const AUTOSAVE_INTERVAL_MS = 5 * 60_000;

/**
 * Пока редактор открыт, раз в `intervalMs` вызывает `save`, если есть
 * несохранённые правки. `save` должен сам не запускаться повторно, пока идёт
 * предыдущее сохранение.
 */
export function useAutosave(
  save: () => Promise<unknown>,
  { dirty, enabled = true, intervalMs = AUTOSAVE_INTERVAL_MS }: {
    dirty: boolean;
    enabled?: boolean;
    intervalMs?: number;
  },
) {
  const saveRef = React.useRef(save);
  const dirtyRef = React.useRef(dirty);
  React.useEffect(() => {
    saveRef.current = save;
    dirtyRef.current = dirty;
  });

  React.useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (dirtyRef.current) void saveRef.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
}

/** Браузер переспросит перед закрытием или перезагрузкой вкладки с несохранёнными правками. */
export function useUnsavedChangesWarning(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
