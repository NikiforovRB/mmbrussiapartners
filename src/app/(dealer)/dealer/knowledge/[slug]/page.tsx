import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { ArrowLeft } from "lucide-react";
import { fioFromParts } from "@/lib/utils";
import { readBlocks } from "@/lib/knowledge-server";
import { categoryPath } from "@/lib/knowledge-browse";
import { formatRuDateTime } from "@/lib/dates";
import { ArticleContent } from "@/components/knowledge/article-content";

export const dynamic = "force-dynamic";

export default async function DealerArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const { slug } = await params;

  const [user, article] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true, dealerProfile: true } }),
    db.knowledgeArticle.findUnique({ where: { slug } }),
  ]);
  if (!article || !article.published) notFound();
  const category = await categoryPath(article.categoryId);

  return (
    <>
      <Topbar
        title="База знаний"
        subtitle={category ?? "Статья"}
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
      <div className="mt-6 max-w-3xl">
        <Link
          href={article.categoryId ? `/dealer/knowledge?category=${article.categoryId}` : "/dealer/knowledge"}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {category ? `К разделу «${category}»` : "Все статьи"}
        </Link>
        <Card className="mt-3">
          {category ? <Tag tone="muted">{category}</Tag> : null}
          <h1 className="mt-2 font-display text-2xl tracking-tight">{article.title}</h1>
          <div className="mt-1 text-xs text-ink-subtle">{formatRuDateTime(article.createdAt)}</div>
          <div className="divider my-4" />
          <ArticleContent blocks={readBlocks(article.blocks)} />
        </Card>
      </div>
    </>
  );
}
