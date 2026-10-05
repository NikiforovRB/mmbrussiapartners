import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Plus, UserCircle } from "lucide-react";
import {
  IconBookOpen,
  IconClipboardCheck,
  IconCodeSquare,
  IconCreditCardCheck,
  IconGrid,
  IconKey,
  IconLifeBuoy,
  IconPasscodeLock,
} from "@/components/icons";
import { Logo } from "@/components/brand/logo";
import { Sidebar, type SidebarItem } from "@/components/cabinet/sidebar";
import { MobileNavProvider } from "@/components/cabinet/mobile-nav";
import { AnnouncementBar } from "@/components/cabinet/announcement-bar";
import { LoginNoticeGate } from "@/components/cabinet/login-notice-gate";
import { mergeAnnouncement } from "@/lib/site-settings";
import { CommandPalette } from "@/components/cabinet/command-palette";
import { CabinetUserProvider } from "@/components/cabinet/cabinet-user";
import { SignOutButton } from "@/components/cabinet/sign-out-button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { clientIp } from "@/lib/rate-limit";
import { trackUserIp } from "@/lib/user-ips";
import { getCabinetSections } from "@/lib/cabinet-sections";

export default async function DealerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dealer");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/login");

  if (user.status === "PENDING") {
    return <PendingScreen email={user.email} />;
  }
  if (user.status === "REJECTED") {
    return <RejectedScreen email={user.email} reason={user.dealerProfile?.rejectionReason ?? null} />;
  }
  if (user.status === "SUSPENDED") {
    return <SuspendedScreen email={user.email} reason={user.dealerProfile?.suspensionReason ?? null} />;
  }
  if (user.isSuperAdmin) {
    redirect("/admin");
  }
  const ip = clientIp(await headers());
  after(() => trackUserIp(user.id, ip));

  const sections = await getCabinetSections();
  const hasLegacyRecords =
    sections.legacyLk &&
    Boolean(await db.legacyRecord.findFirst({ where: { userId: user.id }, select: { id: true } }));
  const items: SidebarItem[] = [
    { href: "/dealer", label: "Дашборд", icon: <IconGrid className="h-4 w-4" /> },
    { href: "/dealer/licenses", label: "Мои лицензии", icon: <IconKey className="h-4 w-4" /> },
    { href: "/dealer/licenses/new", label: "Новая лицензия", icon: <Plus className="h-4 w-4" /> },
    { href: "/dealer/humax", label: "Пароли HUMAX", icon: <IconPasscodeLock className="h-4 w-4" /> },
    { href: "/dealer/payments", label: "Платежи", icon: <IconCreditCardCheck className="h-4 w-4" /> },
    ...(hasLegacyRecords
      ? [{ href: "/dealer/legacy", label: "ЛК DriveMods", icon: <IconCodeSquare className="h-4 w-4" /> }]
      : []),
    { href: "/dealer/reports", label: "Отчёты", icon: <IconClipboardCheck className="h-4 w-4" /> },
    ...(sections.knowledge
      ? [{ href: "/dealer/knowledge", label: "База знаний", icon: <IconBookOpen className="h-4 w-4" /> }]
      : []),
    { href: "/dealer/support", label: "Техподдержка", icon: <IconLifeBuoy className="h-4 w-4" /> },
    { href: "/dealer/profile", label: "Профиль", icon: <UserCircle className="h-4 w-4" /> },
  ];

  const remaining =
    (user.dealerProfile?.licenseLimit ?? 0) - (user.dealerProfile?.licensesUsed ?? 0);
  const limit = user.dealerProfile?.licenseLimit ?? 0;

  const footer = (
    <div className="rounded-panel bg-surface p-3.5">
      <div className="text-xs text-ink-muted">Лимит лицензий</div>
      <div className="mt-1 flex items-end gap-1">
        <div className="font-display text-2xl  tracking-tight">{Math.max(0, remaining)}</div>
        <div className="pb-1 text-xs text-ink-subtle">/ {limit}</div>
      </div>
    </div>
  );

  const [avatarUrl, unreadCount, settings, loginNotices, cookieStore] = await Promise.all([
    getUserAvatarUrl(user.id),
    db.appNotification.count({ where: { userId: user.id, readAt: null } }),
    db.companySettings.findUnique({ where: { id: "singleton" }, select: { announcement: true } }),
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
        name:
          fioFromParts({
            firstName: user.dealerProfile?.firstName,
            lastName: user.dealerProfile?.lastName,
            middleName: user.dealerProfile?.middleName,
          }) || user.email,
        email: user.email,
        role: user.role.name,
        avatarUrl,
        basePath: "/dealer",
        unreadCount,
        permissions: user.role.permissions,
        isSuperAdmin: user.isSuperAdmin,
      }}
    >
      <MobileNavProvider items={items} footer={footer}>
        <div className="cabinet min-h-screen flex flex-col bg-bg">
          {announcement.enabled ? (
            <AnnouncementBar text={announcement.text} updatedAt={announcement.updatedAt ?? null} />
          ) : null}
          <div className="flex flex-1">
            <Sidebar items={items} footer={footer} defaultCollapsed={sidebarCollapsed} />
            <div className="flex-1 min-w-0 px-4 lg:px-6 pb-12">{children}</div>
          </div>
          <LoginNoticeGate notices={loginNotices} />
          <CommandPalette />
        </div>
      </MobileNavProvider>
    </CabinetUserProvider>
  );
}

function PendingScreen({ email }: { email: string }) {
  return (
    <StatusScreen title="Заявка на рассмотрении" contactLabel="Связаться с администратором">
      <p className="mt-2 text-sm text-ink-muted">
        Аккаунт <span className="text-ink">{email}</span> ожидает одобрения администратора.
        Вы получите уведомление сразу после одобрения.
      </p>
    </StatusScreen>
  );
}

function RejectedScreen({ email, reason }: { email: string; reason: string | null }) {
  return (
    <StatusScreen title="Заявка отклонена">
      <p className="mt-2 text-sm text-ink-muted">
        Администратор отклонил заявку на регистрацию аккаунта <span className="text-ink">{email}</span>.
      </p>
      <ReasonBox reason={reason} />
      <p className="mt-4 text-sm text-ink-muted">
        Если это ошибка или данные можно уточнить — свяжитесь с MMB RUSSIA.
      </p>
    </StatusScreen>
  );
}

function SuspendedScreen({ email, reason }: { email: string; reason: string | null }) {
  return (
    <StatusScreen title="Аккаунт заблокирован">
      <p className="mt-2 text-sm text-ink-muted">
        Администратор заблокировал аккаунт <span className="text-ink">{email}</span>: генерация лицензий, оплаты и
        остальные разделы кабинета недоступны.
      </p>
      <ReasonBox reason={reason} />
      <p className="mt-4 text-sm text-ink-muted">Чтобы восстановить доступ, свяжитесь с MMB RUSSIA.</p>
    </StatusScreen>
  );
}

function ReasonBox({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <div className="mt-5 rounded-panel bg-surface-muted px-4 py-3 text-left">
      <div className="text-xs uppercase tracking-widest text-ink-muted">Причина</div>
      <p className="mt-1 whitespace-pre-line break-words text-sm text-ink">{reason}</p>
    </div>
  );
}

function StatusScreen({
  title,
  contactLabel = "Связаться с MMB",
  children,
}: {
  title: string;
  contactLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-bg px-6">
      <div className="rounded-panel bg-surface border border-hairline p-10 max-w-lg w-full text-center">
        <div className="mx-auto flex justify-center">
          <Logo href={undefined} height={40} />
        </div>
        <h1 className="mt-5 font-display text-2xl  tracking-tight">{title}</h1>
        {children}
        <div className="mt-6 flex justify-center gap-3">
          <a
            href="mailto:marat@mmbrussia.ru"
            className="rounded-btn border border-hairline px-5 h-11 inline-flex items-center text-sm transition-colors hover:border-accent hover:text-accent"
          >
            {contactLabel}
          </a>
          <SignOutButton className="rounded-btn bg-bg-dark text-white px-5 h-11 inline-flex items-center text-sm disabled:opacity-50" />
        </div>
      </div>
    </div>
  );
}
