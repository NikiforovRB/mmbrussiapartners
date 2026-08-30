"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Текст для поиска, когда label — не строка. */
  search?: string;
};

export interface SelectProps<T extends string = string> {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Показать строку поиска над списком — для длинных перечней. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

/** Текст, по которому ищем: явный search, иначе строковый label и подсказка. */
function haystack(option: SelectOption<string>): string {
  const parts = [option.search, typeof option.label === "string" ? option.label : "", typeof option.hint === "string" ? option.hint : ""];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Выберите",
  label,
  className,
  disabled,
  searchable,
  searchPlaceholder = "Поиск",
}: SelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Список открывают, чтобы что-то найти: сразу отдаём фокус строке поиска
  // и забываем прошлый запрос.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    if (searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const current = options.find((o) => o.value === value);
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => haystack(o).includes(q));
  }, [options, query, searchable]);

  return (
    <div className={cn("space-y-1.5", className)} ref={ref}>
      {label ? <span className="block text-[12.5px]  text-ink-muted">{label}</span> : null}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={cn(
            "field-control w-full h-12 rounded-panel bg-white border border-hairline px-4 flex items-center justify-between gap-3 text-left text-[14.5px] transition-colors",
            "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
            open && "border-accent",
            !current && "text-ink-subtle",
            disabled && "bg-surface-muted text-ink-muted cursor-not-allowed",
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ink-subtle transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        {open ? (
          <div
            className="absolute z-30 mt-2 w-full rounded-panel bg-white border border-hairline p-2 max-h-72 overflow-auto scrollbar-clean animate-dropdown-in"
            style={{ boxShadow: "0 24px 60px -24px rgba(11,16,32,0.18)" }}
          >
            {searchable ? (
              <div className="sticky -top-2 z-10 -mx-2 -mt-2 mb-2 bg-white px-2 pt-2 pb-2 border-b border-hairline">
                <div className="flex items-center gap-2 rounded-panel border border-hairline px-3 h-10 focus-within:border-accent">
                  <Search className="h-4 w-4 text-ink-subtle shrink-0" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent text-sm placeholder:text-ink-subtle focus:outline-none"
                  />
                </div>
              </div>
            ) : null}
            {visible.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ink-subtle">Ничего не найдено</div>
            ) : null}
            {visible.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-panel px-3 py-2.5 text-sm text-left transition-colors",
                    active ? "bg-surface-muted" : "hover:bg-surface-muted",
                  )}
                >
                  <span className="flex-1">
                    <span className="block">{opt.label}</span>
                    {opt.hint ? <span className="block text-xs text-ink-subtle">{opt.hint}</span> : null}
                  </span>
                  {active ? <Check className="h-4 w-4 text-accent" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
