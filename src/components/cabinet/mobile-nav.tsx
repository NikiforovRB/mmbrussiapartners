"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { SidebarItem } from "./sidebar";

type MobileNavContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  hasNav: boolean;
};

const MobileNavContext = React.createContext<MobileNavContextValue>({
  open: false,
  setOpen: () => {},
  hasNav: false,
});

export function useMobileNav() {
  return React.useContext(MobileNavContext);
}

export function MobileNavProvider({
  items,
  footer,
  children,
}: {
  items: SidebarItem[];
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen, hasNav: true }}>
      {children}
      {open ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Навигация"
        >
          <div
            className="absolute inset-0 bg-[#06121f]/55 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-xs p-3 animate-drawer-in">
            <div className="flex h-full flex-col rounded-panel bg-card-light p-5">
              <div className="mb-6 flex items-center justify-between">
                <Logo height={28} href={undefined} />
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть меню"
                  className="grid h-9 w-9 place-items-center rounded-btn bg-white text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-clean">
                {items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-panel px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                        active
                          ? "bg-white text-ink"
                          : "text-ink-muted hover:bg-white/60 hover:text-ink",
                      )}
                    >
                      <span className="inline-flex w-5 items-center justify-center">
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? <span>{item.badge}</span> : null}
                    </Link>
                  );
                })}
              </nav>

              {footer ? <div className="mt-4 pt-4">{footer}</div> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </MobileNavContext.Provider>
  );
}

export function MobileNavTrigger({ className }: { className?: string }) {
  const { setOpen, hasNav } = useMobileNav();
  if (!hasNav) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Открыть меню"
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-btn border border-hairline text-ink-muted hover:text-ink lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        className,
      )}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
