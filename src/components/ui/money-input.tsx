"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { groupThousands, normalizeMoneyInput } from "@/lib/money";

export { groupThousands };

const GROUP_SEPARATOR = "\u00A0";

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/**
 * Где стоит каретка относительно числа: сколько цифр целой части до неё и,
 * если она за десятичным разделителем, сколько цифр дробной.
 */
type CaretAnchor = { intDigits: number; decDigits: number | null };

function anchorOf(raw: string, caret: number): CaretAnchor {
  const sep = raw.search(/[.,]/);
  let intDigits = 0;
  let decDigits = 0;
  for (let i = 0; i < caret; i++) {
    if (!isDigit(raw[i])) continue;
    if (sep >= 0 && i > sep) decDigits++;
    else intDigits++;
  }
  return { intDigits, decDigits: sep >= 0 && caret > sep ? decDigits : null };
}

function caretFor(formatted: string, anchor: CaretAnchor): number {
  const sep = formatted.indexOf(",") >= 0 ? formatted.indexOf(",") : formatted.indexOf(".");
  if (anchor.decDigits !== null && sep >= 0) {
    return Math.min(formatted.length, sep + 1 + anchor.decDigits);
  }
  const intEnd = sep >= 0 ? sep : formatted.length;
  let pos = formatted.startsWith("-") ? 1 : 0;
  let seen = 0;
  while (pos < intEnd && seen < anchor.intDigits) {
    if (isDigit(formatted[pos])) seen++;
    pos++;
  }
  return pos;
}

export interface MoneyInputProps extends Omit<InputProps, "value" | "onChange" | "inputMode"> {
  /** Несформатированное значение (только цифры/разделитель), как в состоянии. */
  value: string;
  /** Возвращает несформатированное значение: «-1234,56». */
  onChange: (raw: string) => void;
  /** Разрешить отрицательные значения (скидки). */
  allowNegative?: boolean;
  /** Знаков после запятой. */
  decimals?: number;
}

/**
 * Поле для сумм: показывает значение с разбивкой по 3 разряда, а наружу отдаёт
 * «чистую» строку без пробелов с одним разделителем и не более чем одним
 * минусом — её разбирает parseMoney() или `Number(v.replace(",", "."))`.
 *
 * Переформатирование на каждый ввод не должно уводить каретку в конец, поэтому
 * её позиция запоминается по числу цифр до неё и восстанавливается после
 * рендера.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, allowNegative = false, decimals = 2, onKeyDown, ...props },
  ref,
) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingCaret = React.useRef<CaretAnchor | null>(null);
  const display = groupThousands(value);

  const setRefs = React.useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const restoreCaret = React.useCallback(() => {
    const el = inputRef.current;
    const anchor = pendingCaret.current;
    pendingCaret.current = null;
    if (!el || !anchor || document.activeElement !== el) return;
    const pos = caretFor(el.value, anchor);
    el.setSelectionRange(pos, pos);
  }, []);

  React.useLayoutEffect(restoreCaret, [display, restoreCaret]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const next = normalizeMoneyInput(el.value, { allowNegative, decimals });
    pendingCaret.current = anchorOf(el.value, caret);
    // Если строка после нормализации не изменилась, React вернёт прежнее
    // значение без рендера — каретку ставим после этого.
    if (groupThousands(next) === display) requestAnimationFrame(restoreCaret);
    onChange(next);
  }

  // Backspace/Delete по пробелу-разделителю удаляют соседнюю цифру, а не
  // разделитель, который форматирование тут же вернуло бы на место.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    const el = e.currentTarget;
    const start = el.selectionStart;
    if (e.defaultPrevented || start === null || start !== el.selectionEnd) return;
    if (e.key === "Backspace" && el.value[start - 1] === GROUP_SEPARATOR) {
      el.setSelectionRange(start - 1, start - 1);
    } else if (e.key === "Delete" && el.value[start] === GROUP_SEPARATOR) {
      el.setSelectionRange(start + 1, start + 1);
    }
  }

  return (
    <Input
      {...props}
      ref={setRefs}
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
});
