import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = {
  href: string;
  label: string;
  active: boolean;
  count?: number;
};

/** Вкладки-ссылки: раздел выбирается адресом, активная подчёркнута акцентом. */
export function LinkTabs({ tabs, className, label }: { tabs: LinkTab[]; className?: string; label?: string }) {
  return (
    <nav aria-label={label} className={cn("tab-strip scrollbar-none", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
            t.active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
          {typeof t.count === "number" ? (
            <span
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-none tabular-nums",
                t.active ? "bg-accent text-white" : "bg-surface-muted text-ink-muted",
              )}
            >
              {t.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
