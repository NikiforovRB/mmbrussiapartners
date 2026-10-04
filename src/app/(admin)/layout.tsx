import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  IconBarChart,
  IconBell,
  IconBookOpen,
  IconBracketsCheck,
  IconClipboardCheck,
  IconCodeSquare,
  IconCreditCardCheck,
  IconFolderClosed,
  IconGlobe,
  IconGrid,
  IconKey,
  IconLifeBuoy,
  IconPasscodeLock,
  IconSettings,
  IconShieldTick,
  IconTrash,
  IconUserCheck,
  IconUsers,
  IconWallet,
} from "@/components/icons";
import { Sidebar, type SidebarItem } from "@/components/cabinet/sidebar";
import { MobileNavProvider } from "@/components/cabinet/mobile-nav";
import { AnnouncementBar } from "@/components/cabinet/announcement-bar";
import { LoginNoticeGate } from "@/components/cabinet/login-notice-gate";
import { mergeAnnouncement, mergeGenerationSettings } from "@/lib/site-settings";
import { GenerationBlockedNotice } from "@/components/cabinet/generation-blocked-notice";
import { CommandPalette } from "@/components/cabinet/command-palette";
import { CabinetUserProvider } from "@/components/cabinet/cabinet-user";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, hasAdminScope } from "@/lib/permissions";
import { fioFromParts } from "@/lib/utils";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { clientIp } from "@/lib/rate-limit";
import { trackUserIp } from "@/lib/user-ips";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true, dealerProfile: true },
  });
  if (!user) redirect("/login");
  // Права роли действуют только у одобренной учётной записи: заблокированный
  // администратор теряет доступ сразу, не дожидаясь обновления JWT.
  if (user.status !== "APPROVED") redirect("/dealer");

  const avatarUrl = await getUserAvatarUrl(user.id);
  const displayName =
    fioFromParts({
      firstName: user.dealerProfile?.firstName,
      lastName: user.dealerProfile?.lastName,
      middleName: user.dealerProfile?.middleName,
    }) || user.email;

  // Права вида licenses.view есть и у представителя — по ним админку
  // открывал бы любой дилер. Пускает только выход за пределы своего кабинета.
  if (!hasAdminScope(user.role.permissions, user.isSuperAdmin)) redirect("/dealer");
  const ip = clientIp(await headers());
  after(() => trackUserIp(user.id, ip));

  const items: SidebarItem[] = [];
  items.push({ href: "/admin", label: "Дашборд", icon: <IconGrid className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "dealers.view", user.isSuperAdmin))
    items.push({ href: "/admin/dealers", label: "Представители", icon: <IconUsers className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "dealers.view", user.isSuperAdmin))
    items.push({ href: "/admin/legacy-dealers", label: "ЛК DriveMods", icon: <IconCodeSquare className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.view", user.isSuperAdmin))
    items.push({ href: "/admin/licenses", label: "Лицензии", icon: <IconKey className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.view", user.isSuperAdmin))
    items.push({ href: "/admin/humax", label: "Пароли HUMAX", icon: <IconPasscodeLock className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.cancel", user.isSuperAdmin))
    items.push({
      href: "/admin/cancellation-requests",
      label: "Заявки на аннулирование",
      icon: <IconFolderClosed className="h-4 w-4" />,
    });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "users.manage", user.isSuperAdmin))
    items.push({ href: "/admin/users", label: "Пользователи", icon: <IconUserCheck className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "roles.manage", user.isSuperAdmin))
    items.push({ href: "/admin/roles", label: "Роли", icon: <IconShieldTick className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "reports.view", user.isSuperAdmin))
    items.push({ href: "/admin/reports", label: "Отчёты", icon: <IconClipboardCheck className="h-4 w-4" /> });
  if (
    user.isSuperAdmin ||
    hasPermission(user.role.permissions, "stats.view", user.isSuperAdmin) ||
    hasPermission(user.role.permissions, "geo.view", user.isSuperAdmin)
  )
    items.push({ href: "/admin/geo", label: "Гео-аналитика", icon: <IconGlobe className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "payments.view", user.isSuperAdmin))
    items.push({ href: "/admin/payments", label: "Платежи", icon: <IconCreditCardCheck className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "payments.view", user.isSuperAdmin))
    items.push({ href: "/admin/finance", label: "Финансы по дилерам", icon: <IconBarChart className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "pricing.manage", user.isSuperAdmin))
    items.push({ href: "/admin/pricing", label: "Справочник цен", icon: <IconWallet className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "auditLog.view", user.isSuperAdmin))
    items.push({ href: "/admin/audit", label: "Логи", icon: <IconBracketsCheck className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "licenses.restore", user.isSuperAdmin))
    items.push({ href: "/admin/trash", label: "Корзина", icon: <IconTrash className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "settings.edit", user.isSuperAdmin))
    items.push({ href: "/admin/knowledge", label: "База знаний", icon: <IconBookOpen className="h-4 w-4" /> });
  items.push({ href: "/admin/support", label: "Техподдержка", icon: <IconLifeBuoy className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "settings.edit", user.isSuperAdmin))
    items.push({ href: "/admin/notices", label: "Уведомления входа", icon: <IconBell className="h-4 w-4" /> });
  if (user.isSuperAdmin || hasPermission(user.role.permissions, "settings.edit", user.isSuperAdmin))
    items.push({ href: "/admin/settings", label: "Настройки", icon: <IconSettings className="h-4 w-4" /> });

  const [unreadCount, settings, loginNotices, cookieStore] = await Promise.all([
    db.appNotification.count({ where: { userId: user.id, readAt: null } }),
    db.companySettings.findUnique({
      where: { id: "singleton" },
      select: { announcement: true, generation: true },
    }),
    db.loginNotice.findMany({
      where: { active: true, acknowledgements: { none: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, body: true },
    }),
    cookies(),
  ]);
  const announcement = mergeAnnouncement(settings?.announcement);
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

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
      <MobileNavProvider items={items}>
        <div className="cabinet min-h-screen flex flex-col bg-bg">
          {announcement.enabled ? (
            <AnnouncementBar text={announcement.text} updatedAt={announcement.updatedAt ?? null} />
          ) : null}
          <div className="flex flex-1">
            <Sidebar items={items} defaultCollapsed={sidebarCollapsed} />
            <div className="flex-1 min-w-0 px-4 lg:px-6 pb-12">
              <GenerationBlockedNotice
                settings={mergeGenerationSettings(settings?.generation)}
                canEdit={user.isSuperAdmin || hasPermission(user.role.permissions, "settings.edit", user.isSuperAdmin)}
              />
              {children}
            </div>
          </div>
          <LoginNoticeGate notices={loginNotices} />
          <CommandPalette />
        </div>
      </MobileNavProvider>
    </CabinetUserProvider>
  );
}
