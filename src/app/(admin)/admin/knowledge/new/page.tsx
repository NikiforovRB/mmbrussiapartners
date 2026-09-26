import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { ArticleEditor } from "@/components/knowledge/article-editor";
import { loadKnowledgeCategories } from "@/lib/knowledge-browse";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgeNewPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await requireAdminPage("settings.edit");

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
