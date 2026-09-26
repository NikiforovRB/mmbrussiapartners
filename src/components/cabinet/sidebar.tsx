"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

export type SidebarItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
};

/**
 * Подсвечиваем пункт с самым длинным совпадающим адресом. Простая проверка
 * «путь начинается с href» держала бы «Дашборд» (/admin) активным на всех
 * внутренних страницах разом с нужным пунктом.
 */
export function activeNavHref(pathname: string, items: SidebarItem[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if (pathname !== href && !pathname.startsWith(href + "/")) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

/** Иконка из /public/images/menu.svg, перекрашиваемая через currentColor. */
function PanelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M15 3V21M7.8 3H16.2C17.8802 3 18.7202 3 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C21 5.27976 21 6.11984 21 7.8V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sidebar({
  items,
  footer,
  defaultCollapsed = false,
}: {
  items: SidebarItem[];
  footer?: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname, items);
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col shrink-0 sticky top-0 bg-card-light overflow-hidden transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[276px]",
      )}
      // Над меню может висеть плашка объявления: пока она видна, меню короче.
      style={{ height: "calc(100dvh - var(--announcement-offset, 0px))" }}
    >
      <div className={cn("flex flex-col flex-1 min-h-0 py-5", collapsed ? "px-3" : "px-4")}>
        <div className={cn("mb-6 flex items-center", collapsed ? "justify-center" : "justify-between gap-2 px-2")}>
          {collapsed ? null : <Logo height={30} />}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-expanded={!collapsed}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-btn text-black/20 transition-colors hover:text-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <PanelIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto scrollbar-clean">
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center rounded-panel py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  active ? "bg-white text-ink" : "text-ink-muted hover:bg-white/60 hover:text-ink",
                )}
              >
                <span className="relative z-10 inline-flex items-center justify-center w-5">{item.icon}</span>
                {collapsed ? null : <span className="relative z-10 flex-1 whitespace-nowrap">{item.label}</span>}
                {item.badge ? (
                  collapsed ? (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                  ) : (
                    <span className="relative z-10">{item.badge}</span>
                  )
                ) : null}
              </Link>
            );
          })}
        </nav>

        {footer && !collapsed ? <div className="mt-4 pt-4">{footer}</div> : null}
      </div>
    </aside>
  );
}
