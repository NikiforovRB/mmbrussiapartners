import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { loadKnowledgeCategories } from "@/lib/knowledge-browse";
import { CategoriesEditor } from "./categories-editor";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function KnowledgeCategoriesPage() {
  const session = await requireAdminPage("settings.edit");

  const [me, categories, counts] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    loadKnowledgeCategories(),
    db.knowledgeArticle.groupBy({ by: ["categoryId"], _count: { _all: true } }),
  ]);
  const countById = new Map(counts.map((c) => [c.categoryId, c._count._all]));

  return (
    <>
      <Topbar
        title="Категории базы знаний"
        subtitle="База знаний"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6 max-w-3xl space-y-4">
        <Link
          href="/admin/knowledge"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          К статьям
        </Link>
        <CategoriesEditor
          categories={categories.map((c) => ({ ...c, count: countById.get(c.id) ?? 0 }))}
        />
      </div>
    </>
  );
}
