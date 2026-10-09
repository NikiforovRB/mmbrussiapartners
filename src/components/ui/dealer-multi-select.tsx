"use client";

import * as React from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type DealerOption = { id: string; label: string; sub?: string };

/** Мультивыбор дилеров с поиском в первой строке. */
export function DealerMultiSelect({
  options,
  value,
  onChange,
}: {
  options: DealerOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const summary =
    value.length === 0
      ? "Все дилеры"
      : value.length === 1
        ? options.find((o) => o.id === value[0])?.label ?? "1 выбран"
        : `Выбрано: ${value.length}`;

  return (
    <div className="relative" ref={ref}>
      <label className="block text-[12.5px] text-ink-muted mb-1.5">Дилеры</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-panel border border-hairline bg-field px-4 h-12 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-ink-subtle shrink-0" />
          <span className={cn("truncate text-[14.5px]", value.length === 0 && "text-ink-subtle")}>
            {summary}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1.5 w-full min-w-[280px] rounded-panel border border-hairline bg-surface shadow-lg">
          {/* Первая строка — быстрый поиск */}
          <div className="flex items-center gap-2 border-b border-hairline px-3 h-11">
            <Search className="h-4 w-4 text-ink-subtle shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск дилера…"
              className="w-full bg-transparent text-sm placeholder:text-ink-subtle focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => onChange(filtered.map((o) => o.id))}
              className="text-accent hover:underline"
            >
              Выбрать все
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-ink-muted hover:text-danger hover:underline"
            >
              Сбросить
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-clean py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-ink-muted">Не найдено</div>
            ) : (
              filtered.map((o) => {
                const checked = value.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-btn transition-colors",
                        checked ? "bg-accent text-white" : "border border-hairline bg-surface",
                      )}
                    >
                      {checked ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{o.label}</span>
                      {o.sub ? <span className="block truncate text-xs text-ink-muted">{o.sub}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
