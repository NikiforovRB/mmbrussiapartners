import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { ArticleEditor } from "@/components/knowledge/article-editor";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgeNewPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const me = await db.user.findUnique({ where: { id: session.user.id }, include: { role: true } });

  return (
    <>
      <Topbar
        title="Новая статья"
        subtitle="База знаний"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <ArticleEditor
          initial={{ id: null, title: "", category: "", excerpt: "", published: false, blocks: [] }}
        />
      </div>
    </>
  );
}
