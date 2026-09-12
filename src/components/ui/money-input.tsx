"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";

/** Группирует целую часть числа по 3 разряда пробелами: 1000000 → «1 000 000». */
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

/** Убирает разделители, оставляя цифры, десятичный разделитель и минус. */
function clean(display: string): string {
  return display.replace(/[^\d.,-]/g, "");
}

export interface MoneyInputProps extends Omit<InputProps, "value" | "onChange" | "inputMode"> {
  /** Несформатированное значение (только цифры/разделитель), как в состоянии. */
  value: string;
  /** Возвращает несформатированное значение (без пробелов-разделителей). */
  onChange: (raw: string) => void;
}

/**
 * Поле для сумм: показывает значение с разбивкой по 3 разряда, а наружу отдаёт
 * «чистую» строку без пробелов — так вся существующая логика разбора цены
 * (`Number(v.replace(",", "."))`) продолжает работать без изменений.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, ...props },
  ref,
) {
  return (
    <Input
      {...props}
      ref={ref}
      inputMode="decimal"
      value={groupThousands(value)}
      onChange={(e) => onChange(clean(e.target.value))}
    />
  );
});
