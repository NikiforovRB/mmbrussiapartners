import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Plus, ChevronRight, BookOpen } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { formatRuDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage() {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const me = await db.user.findUnique({ where: { id: session.user.id }, include: { role: true } });
  const articles = await db.knowledgeArticle.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, title: true, category: true, published: true, updatedAt: true },
  });

  return (
    <>
      <Topbar
        title="База знаний"
        subtitle="Статьи и инструкции для представителей"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6 space-y-5">
        <div className="flex justify-end">
          <Link href="/admin/knowledge/new">
            <Button icon={<Plus className="h-4 w-4" />}>Создать статью</Button>
          </Link>
        </div>

        {articles.length === 0 ? (
          <Card>
            <div className="py-10 text-center text-sm text-ink-muted">Статей пока нет</div>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-hairline">
              {articles.map((a) => (
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
                        {a.category ? `${a.category} · ` : ""}
                        изменена {formatRuDate(a.updatedAt)}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
