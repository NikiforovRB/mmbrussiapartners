import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { ArticleEditor } from "@/components/knowledge/article-editor";
import { hasPermission } from "@/lib/permissions";
import { readBlocks } from "@/lib/knowledge-server";
import { loadKnowledgeCategories } from "@/lib/knowledge-browse";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const { id } = await params;
  const [me, article, categories] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.knowledgeArticle.findUnique({ where: { id } }),
    loadKnowledgeCategories(),
  ]);
  if (!article) notFound();

  return (
    <>
      <Topbar
        title="Редактирование статьи"
        subtitle="База знаний"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <ArticleEditor
          initial={{
            id: article.id,
            title: article.title,
            categoryId: article.categoryId ?? "",
            excerpt: article.excerpt ?? "",
            published: article.published,
            blocks: readBlocks(article.blocks),
          }}
          categories={categories}
        />
      </div>
    </>
  );
}
