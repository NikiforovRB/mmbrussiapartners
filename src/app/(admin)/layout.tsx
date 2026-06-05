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
} from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/cabinet/sidebar";
import { CommandPalette } from "@/components/cabinet/command-palette";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, requireAny } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user) redirect("/login");

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

  return (
    <div className="min-h-screen flex bg-bg-default">
      <Sidebar
        items={items}
        footer={
          <div className="rounded-panel bg-bg-dark text-white p-3.5">
            <div className="text-[11px] uppercase tracking-widest text-white/60">Роль</div>
            <div className="mt-1 font-display  tracking-tight">{user.role.name}</div>
          </div>
        }
      />
      <div className="flex-1 min-w-0 px-4 lg:px-6 pb-12">{children}</div>
      <CommandPalette />
    </div>
  );
}
