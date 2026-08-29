import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  KeyRound,
  Plus,
  CreditCard,
  UserCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Sidebar, type SidebarItem } from "@/components/cabinet/sidebar";
import { MobileNavProvider } from "@/components/cabinet/mobile-nav";
import { CommandPalette } from "@/components/cabinet/command-palette";
import { CabinetUserProvider } from "@/components/cabinet/cabinet-user";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { getUserAvatarUrl } from "@/lib/user-avatar";

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
  if (user.status === "REJECTED" || user.status === "SUSPENDED") {
    redirect("/login?callbackUrl=/dealer");
  }
  if (user.isSuperAdmin) {
    redirect("/admin");
  }

  const items: SidebarItem[] = [
    { href: "/dealer", label: "Дашборд", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: "/dealer/licenses", label: "Мои лицензии", icon: <KeyRound className="h-4 w-4" /> },
    { href: "/dealer/licenses/new", label: "Новая лицензия", icon: <Plus className="h-4 w-4" /> },
    { href: "/dealer/payments", label: "Платежи", icon: <CreditCard className="h-4 w-4" /> },
    { href: "/dealer/reports", label: "Отчёты", icon: <FileSpreadsheet className="h-4 w-4" /> },
    { href: "/dealer/profile", label: "Профиль", icon: <UserCircle className="h-4 w-4" /> },
  ];

  const remaining =
    (user.dealerProfile?.licenseLimit ?? 0) - (user.dealerProfile?.licensesUsed ?? 0);
  const limit = user.dealerProfile?.licenseLimit ?? 0;

  const footer = (
    <div className="rounded-panel bg-white p-3.5">
      <div className="text-xs text-ink-muted">Лимит лицензий</div>
      <div className="mt-1 flex items-end gap-1">
        <div className="font-display text-2xl  tracking-tight">{Math.max(0, remaining)}</div>
        <div className="pb-1 text-xs text-ink-subtle">/ {limit}</div>
      </div>
    </div>
  );

  const [avatarUrl, unreadCount] = await Promise.all([
    getUserAvatarUrl(user.id),
    db.appNotification.count({ where: { userId: user.id, readAt: null } }),
  ]);

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
        <div className="cabinet min-h-screen flex bg-bg-default">
          <Sidebar items={items} footer={footer} />
          <div className="flex-1 min-w-0 px-4 lg:px-6 pb-12">{children}</div>
          <CommandPalette />
        </div>
      </MobileNavProvider>
    </CabinetUserProvider>
  );
}

function PendingScreen({ email }: { email: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-bg-default px-6">
      <div className="rounded-panel bg-white border border-hairline p-10 max-w-lg w-full text-center">
        <div className="mx-auto flex justify-center">
          <Logo href={undefined} height={40} />
        </div>
        <h1 className="mt-5 font-display text-2xl  tracking-tight">
          Заявка на рассмотрении
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Аккаунт <span className="text-ink">{email}</span> ожидает одобрения администратора.
          Вы получите уведомление сразу после одобрения.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <a
            href="mailto:marat@mmbrussia.ru"
            className="rounded-btn border border-hairline px-5 h-11 inline-flex items-center text-sm transition-colors hover:border-accent hover:text-accent"
          >
            Связаться с MMB
          </a>
          <SignOutForm />
        </div>
      </div>
    </div>
  );
}

function SignOutForm() {
  return (
    <form action="/api/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-btn bg-bg-dark text-white px-5 h-11 inline-flex items-center text-sm"
      >
        Выйти
      </button>
    </form>
  );
}
