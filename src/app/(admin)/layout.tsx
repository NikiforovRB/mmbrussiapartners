import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  KeyRound,
  Shield,
  FileSpreadsheet,
  MapPinned,
  CreditCard,
  History,
  Settings,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/cabinet/sidebar";
import { MobileNavProvider } from "@/components/cabinet/mobile-nav";
import { CommandPalette } from "@/components/cabinet/command-palette";
import { CabinetUserProvider } from "@/components/cabinet/cabinet-user";
import { Avatar } from "@/components/ui/avatar";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, requireAny } from "@/lib/permissions";
import { fioFromParts } from "@/lib/utils";
import { getUserAvatarUrl } from "@/lib/user-avatar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true, dealerProfile: true },
  });
  if (!user) redirect("/login");

  const avatarUrl = await getUserAvatarUrl(user.id);
  const displayName =
    fioFromParts({
      firstName: user.dealerProfile?.firstName,
      lastName: user.dealerProfile?.lastName,
      middleName: user.dealerProfile?.middleName,
    }) || user.email;

  const isAdmin =
    user.isSuperAdmin ||
    requireAny(
      user.role.permissions,
      [
        "dealers.view",
        "licenses.view",
        "roles.manage",
        "reports.view",
        "reports.export",
        "stats.view",
        "geo.view",
        "payments.view",
        "settings.edit",
        "auditLog.view",
        "licenses.restore",
      ],
      user.isSuperAdmin,
    );
  if (!isAdmin) redirect("/dealer");

  const items: SidebarItem[] = [];
  items.push({ href: "/admin", label: "Дашборд", icon: <LayoutDashboard className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "dealers.view", user.isSuperAdmin))
    items.push({ href: "/admin/dealers", label: "Представители", icon: <Users className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.view", user.isSuperAdmin))
    items.push({ href: "/admin/licenses", label: "Лицензии", icon: <KeyRound className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.cancel", user.isSuperAdmin))
    items.push({
      href: "/admin/cancellation-requests",
      label: "Заявки на аннулирование",
      icon: <ClipboardList className="h-4 w-4" />,
    });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "roles.manage", user.isSuperAdmin))
    items.push({ href: "/admin/roles", label: "Роли", icon: <Shield className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "reports.view", user.isSuperAdmin))
    items.push({ href: "/admin/reports", label: "Отчёты", icon: <FileSpreadsheet className="h-4 w-4" /> });
  if (
    user.isSuperAdmin ||
    hasPermission(user.role.permissions, "stats.view", user.isSuperAdmin) ||
    hasPermission(user.role.permissions, "geo.view", user.isSuperAdmin)
  )
    items.push({ href: "/admin/geo", label: "Гео-аналитика", icon: <MapPinned className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "payments.view", user.isSuperAdmin))
    items.push({ href: "/admin/payments", label: "Платежи", icon: <CreditCard className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "auditLog.view", user.isSuperAdmin))
    items.push({ href: "/admin/audit", label: "Аудит", icon: <History className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.restore", user.isSuperAdmin))
    items.push({ href: "/admin/trash", label: "Корзина", icon: <Trash2 className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "settings.edit", user.isSuperAdmin))
    items.push({ href: "/admin/settings", label: "Настройки", icon: <Settings className="h-4 w-4" /> });

  const footer = (
    <div className="rounded-panel bg-bg-dark text-white p-3.5 flex items-center gap-3">
      <Avatar name={displayName} src={avatarUrl} size={40} className="shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-white/60">Роль</div>
        <div className="mt-0.5 font-display tracking-tight truncate">{user.role.name}</div>
      </div>
    </div>
  );

  const unreadCount = await db.appNotification.count({
    where: { userId: user.id, readAt: null },
  });

  return (
    <CabinetUserProvider
      value={{
        name: displayName,
        email: user.email,
        role: user.role.name,
        avatarUrl,
        basePath: "/admin",
        unreadCount,
        permissions: user.role.permissions,
        isSuperAdmin: user.isSuperAdmin,
      }}
    >
      <MobileNavProvider items={items} footer={footer}>
        <div className="cabinet min-h-screen flex bg-bg-default">
          <Sidebar items={items} footer={footer} />
          <div className="flex-1 min-w-0 px-4 lg:px-6 pb-12">{children}</div>
          <CommandPalette />
        </div>
      </MobileNavProvider>
    </CabinetUserProvider>
  );
}
