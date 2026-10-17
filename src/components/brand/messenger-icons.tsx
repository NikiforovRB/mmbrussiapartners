/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** Фирменные значки цветные, поэтому это картинки, а не иконки lucide: currentColor на них не действует. */
export function TelegramIcon({ className }: { className?: string }) {
  return <img src="/images/telegram.png" alt="" aria-hidden className={cn("shrink-0 object-contain", className)} />;
}

export function MaxIcon({ className }: { className?: string }) {
  return <img src="/images/max.png" alt="" aria-hidden className={cn("shrink-0 object-contain", className)} />;
}
