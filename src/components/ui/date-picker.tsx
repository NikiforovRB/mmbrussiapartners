"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { formatRuDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar, localDayKey, parseDayKey, type DayKey } from "./calendar";
import { Modal } from "./modal";

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

/** Кнопка-поле, открывающая окно выбора даты/времени. */
export function PickerTrigger({
  icon,
  text,
  placeholder,
  open,
  disabled,
  onOpen,
  onClear,
}: {
  icon: React.ReactNode;
  text: string | null;
  placeholder: string;
  open: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onClear?: () => void;
}) {
  const clearable = Boolean(onClear && text && !disabled);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "field-control flex h-12 w-full items-center gap-2 rounded-panel border border-hairline bg-white pl-4 text-left text-[14.5px] transition-colors",
          clearable ? "pr-24" : "pr-4",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
          open && "border-accent",
          !text && "text-ink-subtle",
          disabled && "cursor-not-allowed bg-surface-muted text-ink-muted",
        )}
      >
        <span className="shrink-0 text-ink-subtle">{icon}</span>
        <span className="truncate">{text ?? placeholder}</span>
      </button>
      {clearable ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-btn px-1.5 py-1 text-xs text-ink-subtle transition-colors hover:text-ink"
        >
          очистить
        </button>
      ) : null}
    </div>
  );
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
  const todayKey = localDayKey(new Date());
  const minKey = min ? localDayKey(min) : null;
  const maxKey = max ? localDayKey(max) : null;

  const isDisabled = (key: DayKey) =>
    (minKey !== null && key < minKey) || (maxKey !== null && key > maxKey);

  function pick(key: DayKey) {
    const { year, month, day } = parseDayKey(key);
    onChange(new Date(year, month, day));
    setOpen(false);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <span className="block text-[12.5px] text-ink-muted">{label}</span> : null}
      <PickerTrigger
        icon={<CalendarIcon className="h-4 w-4" />}
        text={value ? formatRuDate(value) : null}
        placeholder={placeholder}
        open={open}
        disabled={disabled}
        onOpen={() => setOpen(true)}
        onClear={() => onChange(null)}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label ?? "Выберите дату"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={isDisabled(todayKey)} onClick={() => pick(todayKey)}>
              Сегодня
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </>
        }
      >
        <Calendar
          selected={value ? localDayKey(value) : null}
          today={todayKey}
          onSelect={pick}
          isDisabled={isDisabled}
        />
      </Modal>
    </div>
  );
}
