import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { fioFromParts } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { UsersManager, type ManagedUser, type AssignableRole } from "./users-manager";

export const dynamic = "force-dynamic";

const DEALER_ROLE_NAME = "Представитель";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "users.manage", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const [users, roles] = await Promise.all([
    db.user.findMany({
      where: { role: { name: { not: DEALER_ROLE_NAME } } },
      include: { role: true, dealerProfile: true },
      orderBy: [{ isSuperAdmin: "desc" }, { createdAt: "asc" }],
    }),
    db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
  ]);

  const managed: ManagedUser[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name:
      fioFromParts({
        firstName: u.dealerProfile?.firstName,
        lastName: u.dealerProfile?.lastName,
        middleName: u.dealerProfile?.middleName,
      }) || u.email,
    roleId: u.roleId,
    roleName: u.role.name,
    isSystemRole: u.role.isSystem,
    isSuperAdmin: u.isSuperAdmin,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));

  // Роль представителя через управление пользователями не назначаем.
  const assignable: AssignableRole[] = roles
    .filter((r) => r.name !== DEALER_ROLE_NAME)
    .map((r) => ({ id: r.id, name: r.name, isSystem: r.isSystem }));

  return (
    <>
      <Topbar
        title="Пользователи"
        subtitle="Администраторы и сотрудники с ролями"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <UsersManager
          users={managed}
          roles={assignable}
          meId={session.user.id}
          meIsSuperAdmin={session.user.isSuperAdmin}
        />
      </div>
    </>
  );
}
