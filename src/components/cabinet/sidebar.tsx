"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export type SidebarItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
};

export function Sidebar({
  items,
  footer,
}: {
  items: SidebarItem[];
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-0 h-screen bg-card-light">
      <div className="flex flex-col flex-1 px-4 py-5">
        <div className="px-2 mb-6">
          <Logo height={30} />
        </div>

        <nav className="flex-1 space-y-1">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-panel px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                  active ? "text-ink" : "text-ink-muted hover:bg-white/60 hover:text-ink",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={{ type: "spring", stiffness: 460, damping: 30 }}
                    className="absolute inset-0 rounded-panel bg-white"
                    style={{ zIndex: 0 }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center justify-center w-5">{item.icon}</span>
                <span className="relative z-10 flex-1">{item.label}</span>
                {item.badge ? <span className="relative z-10">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        {footer ? <div className="mt-4 pt-4">{footer}</div> : null}
      </div>
    </aside>
  );
}
