"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { KB_UNCATEGORIZED, type KbTreeNode } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

function TreeLink({
  href,
  label,
  count,
  active,
  className,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 rounded-btn px-2.5 py-1.5 transition-colors",
        active ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cn("text-xs tabular-nums", active ? "text-accent" : "text-ink-subtle")}>{count}</span>
    </Link>
  );
}

/** Дерево категорий базы знаний: категории со сворачиваемыми подкатегориями. */
export function KnowledgeTree({
  basePath,
  tree,
  total,
  uncategorized = 0,
  activeId,
}: {
  basePath: string;
  tree: KbTreeNode[];
  total: number;
  uncategorized?: number;
  activeId: string | null;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const href = (id: string) => `${basePath}?category=${encodeURIComponent(id)}`;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav aria-label="Категории базы знаний" className="space-y-0.5 text-sm">
      <TreeLink href={basePath} label="Все статьи" count={total} active={activeId === null} className="ml-6" />
      {tree.map((c) => {
        const open = !collapsed.has(c.id);
        return (
          <div key={c.id}>
            <div className="flex items-center">
              {c.children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-expanded={open}
                  aria-label={open ? `Свернуть «${c.name}»` : `Развернуть «${c.name}»`}
                  className="grid h-8 w-6 shrink-0 place-items-center rounded-btn text-ink-subtle transition-colors hover:text-ink"
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-90")} />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <TreeLink
                href={href(c.id)}
                label={c.name}
                count={c.count}
                active={activeId === c.id}
                className="flex-1"
              />
            </div>
            {open && c.children.length > 0 ? (
              <div className="ml-[33px] space-y-0.5 border-l border-hairline pl-2">
                {c.children.map((s) => (
                  <TreeLink key={s.id} href={href(s.id)} label={s.name} count={s.count} active={activeId === s.id} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {uncategorized > 0 ? (
        <TreeLink
          href={href(KB_UNCATEGORIZED)}
          label="Без категории"
          count={uncategorized}
          active={activeId === KB_UNCATEGORIZED}
          className="ml-6"
        />
      ) : null}
    </nav>
  );
}
