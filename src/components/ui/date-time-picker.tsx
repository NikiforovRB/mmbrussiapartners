"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { formatRuDateTime, parseMoscowLocal, toMoscowLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar, type DayKey } from "./calendar";
import { PickerTrigger } from "./date-picker";
import { Modal } from "./modal";

export interface DateTimePickerProps {
  /** Московское время «YYYY-MM-DDTHH:mm» (как у datetime-local) или пустая строка. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  minuteStep?: number;
  className?: string;
}

type Draft = { day: DayKey; hour: number; minute: number };

const pad2 = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function draftFrom(value: string, step: number): Draft {
  const source = parseMoscowLocal(value)
    ? value.trim()
    : toMoscowLocal(new Date(Math.ceil(Date.now() / (step * 60_000)) * step * 60_000));
  const [day, time] = source.split("T");
  const [hour, minute] = time.split(":").map(Number);
  return { day, hour, minute };
}

const draftValue = (d: Draft) => `${d.day}T${pad2(d.hour)}:${pad2(d.minute)}`;

export function DateTimePicker({
  value,
  onChange,
  label,
  placeholder = "Выберите дату и время",
  disabled,
  minuteStep = 5,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(value, minuteStep));

  const parsed = parseMoscowLocal(value);
  const text = parsed ? formatRuDateTime(parsed) : value || null;

  const minutes = React.useMemo(() => {
    const list = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
    return list.includes(draft.minute) ? list : [...list, draft.minute].sort((a, b) => a - b);
  }, [minuteStep, draft.minute]);

  function openPicker() {
    setDraft(draftFrom(value, minuteStep));
    setOpen(true);
  }

  function apply() {
    onChange(draftValue(draft));
    setOpen(false);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <span className="block text-[12.5px] text-ink-muted">{label}</span> : null}
      <PickerTrigger
        icon={<CalendarClock className="h-4 w-4" />}
        text={text}
        placeholder={placeholder}
        open={open}
        disabled={disabled}
        onOpen={openPicker}
        onClear={() => onChange("")}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label ?? "Дата и время"}
        description="Время московское"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={apply}>Готово</Button>
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_136px]">
          <Calendar
            selected={draft.day}
            today={toMoscowLocal(new Date()).slice(0, 10)}
            onSelect={(day) => setDraft((d) => ({ ...d, day }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <TimeColumn
              label="Часы"
              values={HOURS}
              selected={draft.hour}
              onSelect={(hour) => setDraft((d) => ({ ...d, hour }))}
            />
            <TimeColumn
              label="Минуты"
              values={minutes}
              selected={draft.minute}
              onSelect={(minute) => setDraft((d) => ({ ...d, minute }))}
            />
          </div>
        </div>
        <div className="mt-4 rounded-panel bg-surface-muted px-4 py-3 text-sm">
          {formatRuDateTime(parseMoscowLocal(draftValue(draft)))}
        </div>
      </Modal>
    </div>
  );
}

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // При открытии окна прокручиваем колонку к выбранному значению.
  React.useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
  }, []);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-center text-[11px] uppercase tracking-tight text-ink-subtle">
        {label}
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="scrollbar-clean relative h-44 space-y-0.5 overflow-y-auto rounded-panel border border-hairline p-1 sm:h-[300px]"
      >
        {values.map((v) => (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={v === selected}
            onClick={() => onSelect(v)}
            className={cn(
              "block h-9 w-full rounded-btn text-sm tabular-nums transition-colors",
              v === selected ? "bg-accent text-white" : "hover:bg-surface-muted",
            )}
          >
            {pad2(v)}
          </button>
        ))}
      </div>
    </div>
  );
}
