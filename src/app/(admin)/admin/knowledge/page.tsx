import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Plus, ChevronRight, BookOpen, FolderTree } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { formatRuDateTime } from "@/lib/dates";
import { KB_UNCATEGORIZED } from "@/lib/knowledge";
import { loadKnowledgeBrowser } from "@/lib/knowledge-browse";
import { KnowledgeBrowser } from "@/components/knowledge/knowledge-browser";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const [me, data] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    loadKnowledgeBrowser({ publishedOnly: false, category: sp.category, q: sp.q }),
  ]);

  const newHref =
    data.active && data.active.id !== KB_UNCATEGORIZED
      ? `/admin/knowledge/new?category=${encodeURIComponent(data.active.id)}`
      : "/admin/knowledge/new";

  return (
    <>
      <Topbar
        title="База знаний"
        subtitle="Статьи и инструкции для представителей"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <KnowledgeBrowser
          basePath="/admin/knowledge"
          tree={data.tree}
          total={data.total}
          uncategorized={data.uncategorized}
          active={data.active}
          query={data.query}
          found={data.articles.length}
          treeFooter={
            <Link
              href="/admin/knowledge/categories"
              className="flex items-center gap-2 rounded-btn px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-accent"
            >
              <FolderTree className="h-4 w-4" />
              Редактор категорий
            </Link>
          }
          toolbar={
            <Link href={newHref}>
              <Button icon={<Plus className="h-4 w-4" />} className="whitespace-nowrap">
                Создать статью
              </Button>
            </Link>
          }
        >
          {data.articles.length === 0 ? (
            <Card>
              <div className="py-10 text-center text-sm text-ink-muted">
                {data.query
                  ? "Ничего не найдено"
                  : data.active
                    ? "В этой категории пока нет статей"
                    : "Статей пока нет"}
              </div>
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <ul className="divide-y divide-hairline">
                {data.articles.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/admin/knowledge/${a.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-btn bg-surface-muted text-ink-subtle shrink-0">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{a.title}</span>
                          {a.published ? <Tag tone="success">Опубликована</Tag> : <Tag tone="muted">Черновик</Tag>}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {a.categoryPath ? `${a.categoryPath} · ` : ""}
                          изменена {formatRuDateTime(a.updatedAt)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </KnowledgeBrowser>
      </div>
    </>
  );
}
