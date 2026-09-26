import * as React from "react";
import { Card } from "@/components/ui/card";
import type { KbTreeNode } from "@/lib/knowledge";
import { plural } from "@/lib/utils";
import { KnowledgeTree } from "./knowledge-tree";
import { KnowledgeSearch } from "./knowledge-search";

/**
 * Раздел «База знаний»: слева дерево категорий, справа поиск и список статей.
 * Общий для кабинета администратора и представителя.
 */
export function KnowledgeBrowser({
  basePath,
  tree,
  total,
  uncategorized,
  active,
  query,
  found,
  treeFooter,
  toolbar,
  children,
}: {
  basePath: string;
  tree: KbTreeNode[];
  total: number;
  uncategorized?: number;
  active: { id: string; name: string } | null;
  query: string;
  found: number;
  treeFooter?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const heading = query
    ? `Поиск «${query}»: ${found} ${plural(found, ["статья", "статьи", "статей"])}`
    : active
      ? active.name
      : null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
      <Card className="p-3 lg:sticky lg:top-24">
        <div className="px-2.5 pb-2 pt-1 text-[11px] uppercase tracking-tight text-ink-subtle">Категории</div>
        <KnowledgeTree
          basePath={basePath}
          tree={tree}
          total={total}
          uncategorized={uncategorized}
          activeId={query ? "" : (active?.id ?? null)}
        />
        {treeFooter ? <div className="mt-3 border-t border-hairline pt-3">{treeFooter}</div> : null}
      </Card>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <KnowledgeSearch basePath={basePath} initialQuery={query} className="min-w-0 flex-1 basis-64" />
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
        {heading ? <div className="font-display text-lg tracking-tight">{heading}</div> : null}
        {children}
      </div>
    </div>
  );
}
