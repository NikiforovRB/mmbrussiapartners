"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp, Columns3, GripVertical, RotateCcw } from "lucide-react";
import type { ColumnState } from "@/lib/column-state";
import { cn } from "@/lib/utils";

/** Меню «Колонки»: видимость и порядок колонок, перетаскиванием или стрелками. */
export function ColumnsMenu<K extends string>({
  columns,
  labelOf,
  onChange,
  onReset,
}: {
  columns: ColumnState<K>[];
  labelOf: (key: K) => string;
  onChange: (next: ColumnState<K>[]) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function move(from: number, to: number) {
    if (to < 0 || to >= columns.length || from === to) return;
    const next = [...columns];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function toggle(index: number) {
    onChange(columns.map((c, i) => (i === index ? { ...c, visible: !c.visible } : c)));
  }

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-btn border border-hairline px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Колонки · {visibleCount}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-panel border border-hairline bg-surface shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
            <span className="text-xs text-ink-muted">Перетащите, чтобы изменить порядок</span>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
              title="Вернуть колонки по умолчанию"
            >
              <RotateCcw className="h-3 w-3" /> Сброс
            </button>
          </div>
          <ul className="max-h-[360px] overflow-y-auto scrollbar-clean py-1">
            {columns.map((c, index) => (
              <li
                key={c.key}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) {
                    move(dragIndex, index);
                    setDragIndex(index);
                  }
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm transition-colors",
                  dragIndex === index ? "bg-accent/10" : "hover:bg-surface-muted",
                )}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-subtle" />
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-[4px] transition-colors",
                      c.visible ? "bg-accent text-white" : "border border-hairline bg-surface",
                    )}
                  >
                    {c.visible ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className={cn("truncate", !c.visible && "text-ink-muted")}>{labelOf(c.key)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="rounded p-0.5 text-ink-subtle hover:text-accent disabled:opacity-30"
                  aria-label="Выше"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === columns.length - 1}
                  className="rounded p-0.5 text-ink-subtle hover:text-accent disabled:opacity-30"
                  aria-label="Ниже"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
