const MOSCOW_TZ = "Europe/Moscow";

const SHORT_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  weekday: "short",
  timeZone: MOSCOW_TZ,
});

const LONG_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  weekday: "short",
  timeZone: MOSCOW_TZ,
});

const TIME_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: MOSCOW_TZ,
  hour12: false,
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: MOSCOW_TZ,
  hour12: false,
});

export const RU_MONTHS_NOM = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export const RU_MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export const RU_WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
export const RU_WEEKDAYS_FULL = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

function ensureDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRuDate(value: Date | string | number | null | undefined): string {
  const d = ensureDate(value);
  if (!d) return "—";
  return normalizeRuDate(SHORT_FORMATTER.format(d));
}

export function formatRuDateLong(value: Date | string | number | null | undefined): string {
  const d = ensureDate(value);
  if (!d) return "—";
  return normalizeRuDate(LONG_FORMATTER.format(d));
}

export function formatRuTime(value: Date | string | number | null | undefined): string {
  const d = ensureDate(value);
  if (!d) return "—";
  return TIME_FORMATTER.format(d);
}

export function formatRuDateTime(value: Date | string | number | null | undefined): string {
  const d = ensureDate(value);
  if (!d) return "—";
  return normalizeRuDate(DATETIME_FORMATTER.format(d));
}

function normalizeRuDate(input: string) {
  return input.replace(/^([А-Яа-я]+),\s*(.*)$/u, (_, weekday: string, rest: string) => {
    return `${rest}, ${weekday}`;
  });
}

export function startOfMoscowDay(value: Date): Date {
  const d = ensureDate(value);
  if (!d) return new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: MOSCOW_TZ,
  });
  const [{ value: year }, , { value: month }, , { value: day }] = fmt.formatToParts(d);
  return new Date(`${year}-${month}-${day}T00:00:00+03:00`);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function getMoscowParts(value: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: MOSCOW_TZ,
  });
  const parts = fmt.formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

export function rangePresets() {
  const now = new Date();
  const today = startOfMoscowDay(now);
  return [
    { id: "today", label: "Сегодня", from: today, to: addDays(today, 1) },
    { id: "7d", label: "7 дней", from: addDays(today, -6), to: addDays(today, 1) },
    { id: "30d", label: "30 дней", from: addDays(today, -29), to: addDays(today, 1) },
    { id: "quarter", label: "Квартал", from: addMonths(today, -3), to: addDays(today, 1) },
    { id: "year", label: "Год", from: addMonths(today, -12), to: addDays(today, 1) },
  ] as const;
}

export function isSameMoscowDay(a: Date, b: Date) {
  const pa = getMoscowParts(a);
  const pb = getMoscowParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}
