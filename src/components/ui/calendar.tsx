"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RU_MONTHS_NOM } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** День «YYYY-MM-DD» без часового пояса; такие строки сравниваются лексикографически. */
export type DayKey = string;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function dayKey(year: number, month: number, day: number): DayKey {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function localDayKey(d: Date): DayKey {
  return dayKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseDayKey(key: DayKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month: month - 1, day };
}

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function Calendar({
  selected,
  today,
  onSelect,
  isDisabled,
}: {
  selected: DayKey | null;
  today: DayKey;
  onSelect: (key: DayKey) => void;
  isDisabled?: (key: DayKey) => boolean;
}) {
  const [view, setView] = React.useState(() => {
    const { year, month } = parseDayKey(selected ?? today);
    return { year, month };
  });

  React.useEffect(() => {
    if (!selected) return;
    const { year, month } = parseDayKey(selected);
    setView({ year, month });
  }, [selected]);

  const cells = React.useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(Date.UTC(view.year, view.month, 1 - offset + i));
      return {
        key: dayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === view.month,
      };
    });
  }, [view]);

  function shift(n: number) {
    setView((v) => {
      const m = v.month + n;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  const monthName = RU_MONTHS_NOM[view.month];

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Предыдущий месяц"
          className="grid h-9 w-9 place-items-center rounded-btn transition-colors hover:bg-surface-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm tracking-tight">
          {monthName.charAt(0).toUpperCase() + monthName.slice(1)} {view.year}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Следующий месяц"
          className="grid h-9 w-9 place-items-center rounded-btn transition-colors hover:bg-surface-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] tracking-tight text-ink-subtle">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const isSelected = c.key === selected;
          const disabled = isDisabled?.(c.key) ?? false;
          return (
            <button
              key={c.key}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(c.key)}
              className={cn(
                "h-10 rounded-btn text-sm tabular-nums transition-colors duration-150",
                !c.inMonth && "text-ink-subtle/60",
                isSelected
                  ? "bg-accent text-white"
                  : c.key === today
                    ? "bg-surface-muted text-ink"
                    : "hover:bg-surface-muted",
                disabled && "cursor-not-allowed opacity-30",
              )}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
