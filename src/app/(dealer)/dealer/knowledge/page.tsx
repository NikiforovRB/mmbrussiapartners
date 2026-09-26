import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { BookOpen, ChevronRight } from "lucide-react";
import { fioFromParts } from "@/lib/utils";
import { formatRuDateTime } from "@/lib/dates";
import { loadKnowledgeBrowser } from "@/lib/knowledge-browse";
import { KnowledgeBrowser } from "@/components/knowledge/knowledge-browser";

export const dynamic = "force-dynamic";

export default async function DealerKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const sp = await searchParams;
  const [user, data] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true, dealerProfile: true } }),
    loadKnowledgeBrowser({ publishedOnly: true, category: sp.category, q: sp.q }),
  ]);

  return (
    <>
      <Topbar
        title="База знаний"
        subtitle="Инструкции и полезные материалы"
        user={{
          name:
            fioFromParts({
              firstName: user?.dealerProfile?.firstName,
              lastName: user?.dealerProfile?.lastName,
              middleName: user?.dealerProfile?.middleName,
            }) || user?.email || "",
          email: user?.email ?? "",
          role: user?.role.name ?? "",
        }}
      />
      <div className="mt-6">
        <KnowledgeBrowser
          basePath="/dealer/knowledge"
          tree={data.tree}
          total={data.total}
          active={data.active}
          query={data.query}
          found={data.articles.length}
        >
          {data.articles.length === 0 ? (
            <Card>
              <div className="py-12 text-center text-sm text-ink-muted">
                {data.query
                  ? "Ничего не найдено"
                  : data.active
                    ? "В этой категории пока нет статей"
                    : "Пока нет опубликованных статей"}
              </div>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {data.articles.map((a) => (
                <Link key={a.slug} href={`/dealer/knowledge/${a.slug}`}>
                  <Card className="h-full transition-colors hover:border-accent">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-btn bg-surface-muted text-accent shrink-0">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {a.categoryPath ? <Tag tone="muted">{a.categoryPath}</Tag> : null}
                        <div className="mt-1.5 font-display tracking-tight">{a.title}</div>
                        {a.preview ? (
                          <p className="mt-1 text-sm text-ink-muted line-clamp-2">{a.preview}</p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1 text-xs text-ink-subtle">
                          {formatRuDateTime(a.createdAt)}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </KnowledgeBrowser>
      </div>
    </>
  );
}
