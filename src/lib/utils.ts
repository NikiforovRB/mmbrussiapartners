import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const tail = digits.slice(1);
    return `+7 ${tail.slice(0, 3)} ${tail.slice(3, 6)}-${tail.slice(6, 8)}-${tail.slice(8, 10)}`;
  }
  return input;
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatCurrency(value: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function generateLicenseNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MMB-${year}-${random}`;
}

export function fioFromParts(p: { firstName?: string | null; lastName?: string | null; middleName?: string | null }): string {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

/**
 * Русское склонение после числа: 1 позиция, 2 позиции, 5 позиций.
 * Формы передаются в порядке «одна, две, пять».
 */
export function plural(count: number, forms: [string, string, string]): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

export function initials(name: string | undefined | null): string {
  if (!name) return "MR";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
