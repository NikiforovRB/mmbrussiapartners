/**
 * Деньги в интерфейсе, письмах и уведомлениях: один формат на весь портал.
 * Модуль без серверных зависимостей — его импортируют и клиентские компоненты.
 */

const RUB_WHOLE = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const RUB_KOPECKS = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** «10 000 ₽», с копейками — «1 234,50 ₽». */
export function formatRub(value: number | string | { toString(): string }): string {
  const n = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(n)) return "—";
  return Math.round(n * 100) % 100 === 0 ? RUB_WHOLE.format(n) : RUB_KOPECKS.format(n);
}

/** Группирует целую часть числа по 3 разряда: 1000000 → «1 000 000». */
export function groupThousands(raw: string): string {
  const s = String(raw ?? "").trim();
  if (s === "") return "";
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const m = body.match(/^(\d*)([.,]?)(\d*)$/);
  if (!m) return raw;
  const [, intPart, sep, dec] = m;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return (neg ? "-" : "") + grouped + sep + dec;
}

/**
 * Приводит ввод суммы к виду «-1234,56»: только цифры, один минус в начале и
 * один десятичный разделитель (запятая), не больше `decimals` знаков после него.
 */
export function normalizeMoneyInput(
  input: string,
  { allowNegative = false, decimals = 2 }: { allowNegative?: boolean; decimals?: number } = {},
): string {
  const s = String(input ?? "");
  const neg = allowNegative && s.trimStart().startsWith("-");
  let intPart = "";
  let dec = "";
  let hasSep = false;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      if (hasSep) {
        if (dec.length < decimals) dec += ch;
      } else {
        intPart += ch;
      }
    } else if ((ch === "," || ch === ".") && !hasSep && decimals > 0) {
      hasSep = true;
    }
  }
  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (hasSep && intPart === "") intPart = "0";
  return (neg ? "-" : "") + intPart + (hasSep ? `,${dec}` : "");
}

/** Число из строки поля суммы; null — пусто или не число. */
export function parseMoney(raw: string): number | null {
  const s = String(raw ?? "").replace(/[\s\u00A0]/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
