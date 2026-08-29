"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { LogOut, Search, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { MobileNavTrigger } from "@/components/cabinet/mobile-nav";
import { NotificationPanel } from "@/components/cabinet/notification-panel";
import { useCabinetUser } from "@/components/cabinet/cabinet-user";
import { cn } from "@/lib/utils";

export function Topbar({
  title,
  subtitle,
  user,
  rightSlot,
  onSearch,
  profileHref,
}: {
  title: string;
  subtitle?: string;
  user: { name: string; email: string; role: string };
  rightSlot?: React.ReactNode;
  onSearch?: (q: string) => void;
  profileHref?: string;
}) {
  const cabinet = useCabinetUser();
  const resolvedProfileHref = profileHref ?? `${cabinet?.basePath ?? "/dealer"}/profile`;

  const [open, setOpen] = React.useState(false);
  // Стартовое значение приходит с сервера; перезапрашиваем только после
  // загрузки нового аватара, а не на каждом заходе на страницу.
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(cabinet?.avatarUrl ?? null);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onAvatarUpdated() {
      fetch("/api/profile/avatar")
        .then((res) => (res.ok ? res.json() : { url: null }))
        .then((data: { url?: string | null }) => setAvatarUrl(data.url ?? null))
        .catch(() => {});
    }
    window.addEventListener("avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("avatar-updated", onAvatarUpdated);
  }, []);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="sticky top-0 z-20 -mx-4 lg:-mx-6 border-b border-hairline bg-white/80 backdrop-blur-xl">
      <div className="px-4 lg:px-6 py-3 flex items-center gap-3 sm:gap-4">
        <MobileNavTrigger />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg  tracking-tight truncate">{title}</div>
          {subtitle ? <div className="text-xs text-ink-muted truncate">{subtitle}</div> : null}
        </div>
        {onSearch ? (
          <div className="hidden md:flex items-center gap-2 rounded-panel border border-hairline px-3.5 h-10 w-72 transition-colors focus-within:border-accent">
            <Search className="h-4 w-4 text-ink-subtle" />
            <input
              placeholder="Поиск..."
              onChange={(e) => onSearch(e.target.value)}
              className="bg-transparent w-full text-sm placeholder:text-ink-subtle"
            />
          </div>
        ) : null}
        {rightSlot}
        <NotificationPanel initialUnread={cabinet?.unreadCount ?? 0} />
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-btn pl-1.5 pr-3 h-10 transition-colors hover:bg-surface-muted"
          >
            <Avatar name={user.name} src={avatarUrl} size={32} />
            <div className="text-left leading-tight hidden sm:block">
              <div className="text-[12.5px] ">{user.name}</div>
              <div className="text-[11px] text-ink-muted">{user.role}</div>
            </div>
          </button>
          <div
            className={cn(
              "absolute right-0 top-12 w-60 origin-top-right rounded-panel bg-white border border-hairline p-2 transition duration-150 ease-out",
              open ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1.5",
            )}
            style={{ boxShadow: "0 24px 60px -24px rgba(11,16,32,0.18)" }}
          >
            <div className="px-3 py-2 text-xs text-ink-muted">{user.email}</div>
            <Link
              href={resolvedProfileHref}
              className="flex items-center gap-2.5 rounded-panel px-3 py-2 text-sm hover:bg-surface-muted"
            >
              <UserIcon className="h-4 w-4" /> Профиль
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center gap-2.5 rounded-panel px-3 py-2 text-sm text-danger hover:bg-surface-muted"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
