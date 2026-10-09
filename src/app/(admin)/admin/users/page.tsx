import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { getDownloadUrl } from "@/lib/s3";
import { fioFromParts } from "@/lib/utils";
import { UsersManager, type ManagedUser, type AssignableRole } from "./users-manager";
import { requireAdminPage } from "@/lib/session";
import { DEALER_ROLE_NAMES, isDealerRoleName } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireAdminPage("users.manage");

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const [users, roles] = await Promise.all([
    db.user.findMany({
      where: { role: { name: { notIn: DEALER_ROLE_NAMES } } },
      include: { role: true, dealerProfile: true },
      orderBy: [{ isSuperAdmin: "desc" }, { createdAt: "asc" }],
    }),
    db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
  ]);

  const avatarUrls = await Promise.all(
    users.map((u) =>
      u.dealerProfile?.avatarKey
        ? getDownloadUrl(u.dealerProfile.avatarKey, 3600).catch(() => null)
        : null,
    ),
  );

  const managed: ManagedUser[] = users.map((u, i) => ({
    id: u.id,
    email: u.email,
    name:
      fioFromParts({
        firstName: u.dealerProfile?.firstName,
        lastName: u.dealerProfile?.lastName,
        middleName: u.dealerProfile?.middleName,
      }) || u.email,
    avatarUrl: avatarUrls[i],
    profile: {
      lastName: u.dealerProfile?.lastName ?? "",
      firstName: u.dealerProfile?.firstName ?? "",
      middleName: u.dealerProfile?.middleName ?? "",
      phone: u.dealerProfile?.phone ?? "",
    },
    roleId: u.roleId,
    roleName: u.role.name,
    isSystemRole: u.role.isSystem,
    isSuperAdmin: u.isSuperAdmin,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));

  // Роль дилера через управление пользователями не назначаем.
  const assignable: AssignableRole[] = roles
    .filter((r) => !isDealerRoleName(r.name))
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
