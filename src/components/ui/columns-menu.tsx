"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp, Columns3, GripVertical, RotateCcw } from "lucide-react";
import type { ColumnState } from "@/lib/column-state";
import { cn } from "@/lib/utils";

/** w-72 */
const PANEL_WIDTH = 288;
const LIST_MAX_HEIGHT = 360;
/** Шапка панели с подсказкой и «Сброс». */
const PANEL_HEADER = 44;
const GAP = 6;
const VIEWPORT_MARGIN = 8;

type PanelPosition = { left: number; top?: number; bottom?: number; listMaxHeight: number };

/** Панель прижата к правому краю кнопки и раскрывается вниз, а если снизу мало места — вверх. */
function panelPosition(anchor: HTMLElement): PanelPosition {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
  );
  const below = window.innerHeight - r.bottom - GAP - VIEWPORT_MARGIN - PANEL_HEADER;
  const above = r.top - GAP - VIEWPORT_MARGIN - PANEL_HEADER;
  const up = below < Math.min(LIST_MAX_HEIGHT, 200) && above > below;
  const listMaxHeight = Math.max(120, Math.min(LIST_MAX_HEIGHT, up ? above : below));
  return up
    ? { left, bottom: window.innerHeight - r.top + GAP, listMaxHeight }
    : { left, top: r.bottom + GAP, listMaxHeight };
}

/**
 * Меню «Колонки»: видимость и порядок колонок, перетаскиванием или стрелками.
 * Панель живёт в body с position: fixed — иначе её обрезает карточка таблицы с overflow-hidden.
 */
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
  const [position, setPosition] = React.useState<PanelPosition | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    function place() {
      if (buttonRef.current) setPosition(panelPosition(buttonRef.current));
    }
    function onScroll(e: Event) {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      place();
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
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
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-btn border border-hairline px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Колонки · {visibleCount}
      </button>
      {open && position ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[70] w-72 rounded-panel border border-hairline bg-surface shadow-lg"
          style={{ left: position.left, top: position.top, bottom: position.bottom }}
        >
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
          <ul className="overflow-y-auto scrollbar-clean py-1" style={{ maxHeight: position.listMaxHeight }}>
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
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
