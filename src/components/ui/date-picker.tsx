"use client";

import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  RU_MONTHS_NOM,
  RU_WEEKDAYS_SHORT,
  formatRuDate,
  isSameMoscowDay,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
  label?: string;
  placeholder?: string;
  min?: Date;
  max?: Date;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Выберите дату",
  min,
  max,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const today = React.useMemo(() => new Date(), []);
  const [view, setView] = React.useState<{ year: number; month: number }>(
    () => {
      const d = value ?? today;
      return { year: d.getFullYear(), month: d.getMonth() };
    },
  );

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const days = React.useMemo(
    () => buildMonthGrid(view.year, view.month),
    [view],
  );

  function shift(n: number) {
    setView((v) => {
      const nm = v.month + n;
      const year = v.year + Math.floor(nm / 12);
      const month = ((nm % 12) + 12) % 12;
      return { year, month };
    });
  }

  function isDisabled(d: Date) {
    if (min && d.getTime() < startOfDay(min).getTime()) return true;
    if (max && d.getTime() > startOfDay(max).getTime()) return true;
    return false;
  }

  return (
    <div ref={ref} className={cn("space-y-1.5 relative", className)}>
      {label ? (
        <span className="block text-[12.5px]  text-ink-muted">{label}</span>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "field-control w-full h-12 rounded-panel bg-white border border-hairline px-4 flex items-center justify-between gap-3 text-left text-[14.5px] transition-colors",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
          open && "border-accent",
          !value && "text-ink-subtle",
          disabled && "bg-surface-muted text-ink-muted cursor-not-allowed",
        )}
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-ink-subtle" />
          {value ? formatRuDate(value) : placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="text-xs text-ink-subtle hover:text-ink"
          >
            очистить
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute z-40 mt-2 w-[320px] rounded-panel bg-white border border-hairline p-4 animate-dropdown-in"
          style={{ boxShadow: "0 24px 60px -24px rgba(11,16,32,0.18)" }}
        >
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="grid h-9 w-9 place-items-center rounded-btn hover:bg-surface-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm tracking-tight">
              {capitalize(RU_MONTHS_NOM[view.month])} {view.year}
            </div>
            <button
              type="button"
              onClick={() => shift(1)}
              className="grid h-9 w-9 place-items-center rounded-btn hover:bg-surface-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-tight text-ink-subtle">
            {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const isCurrentMonth = d.getMonth() === view.month;
              const selected = value ? isSameMoscowDay(value, d) : false;
              const isToday = isSameMoscowDay(today, d);
              const disabledDay = isDisabled(d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-9 w-9 rounded-btn text-sm transition-colors duration-150",
                    !isCurrentMonth && "text-ink-subtle/60",
                    selected
                      ? "bg-accent text-white"
                      : isToday
                        ? "bg-surface-muted text-ink"
                        : "hover:bg-surface-muted",
                    disabledDay && "opacity-30 cursor-not-allowed",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
            <button
              type="button"
              onClick={() => {
                onChange(today);
                setView({ year: today.getFullYear(), month: today.getMonth() });
                setOpen(false);
              }}
              className="rounded-btn px-3 py-1.5 hover:bg-surface-muted"
            >
              Сегодня
            </button>
            <span className="text-[11px]">{formatRuDate(value ?? today)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offsetMonday = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offsetMonday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  }
  return days;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
