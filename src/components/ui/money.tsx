import { formatRub } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Сумма в рублях одной строкой: «999 999 ₽» не разрывается и знак рубля не уезжает вниз. */
export function Money({
  value,
  className,
}: {
  value: Parameters<typeof formatRub>[0];
  className?: string;
}) {
  return <span className={cn("whitespace-nowrap", className)}>{formatRub(value)}</span>;
}
