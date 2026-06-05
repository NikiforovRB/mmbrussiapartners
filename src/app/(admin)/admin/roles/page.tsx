import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { PageHeader } from "@/components/cabinet/page-header";
import { RolesManager } from "./roles-manager";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [roles, me] = await Promise.all([
    db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
  ]);

  return (
    <>
      <Topbar
        title="Роли и права"
        subtitle="Создавайте кастомные роли с галочками"
        user={{
          name: me?.email ?? "Admin",
          email: me?.email ?? "",
          role: me?.role.name ?? "Admin",
        }}
      />
      <div className="mt-6">
        <PageHeader
          title="Роли"
          description="Системная роль 'Администратор' защищена и имеет все права. Создавайте кастомные роли для гибкого распределения доступа."
        />
        <RolesManager roles={JSON.parse(JSON.stringify(roles))} />
      </div>
    </>
  );
}
