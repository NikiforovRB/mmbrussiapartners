import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { ArticleEditor } from "@/components/knowledge/article-editor";
import { hasPermission } from "@/lib/permissions";
import { loadKnowledgeCategories } from "@/lib/knowledge-browse";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgeNewPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const [me, categories] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    loadKnowledgeCategories(),
  ]);
  // Статья, созданная из открытой категории, сразу попадает в неё.
  const categoryId = categories.some((c) => c.id === sp.category) ? (sp.category ?? "") : "";

  return (
    <>
      <Topbar
        title="Новая статья"
        subtitle="База знаний"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <ArticleEditor
          initial={{ id: null, title: "", categoryId, excerpt: "", published: false, blocks: [] }}
          categories={categories}
        />
      </div>
    </>
  );
}
