"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import { getCabinetPath } from "@/lib/cabinet-path";
import { Bell, LogOut, Search, User as UserIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { MobileNavTrigger } from "@/components/cabinet/mobile-nav";

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
  const { data: session } = useSession();
  const resolvedProfileHref =
    profileHref ??
    (session?.user && getCabinetPath(session.user) === "/admin" ? "/admin/profile" : "/dealer/profile");

  const [open, setOpen] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const loadAvatar = React.useCallback(() => {
    fetch("/api/profile/avatar")
      .then((res) => (res.ok ? res.json() : { url: null }))
      .then((data: { url?: string | null }) => setAvatarUrl(data.url ?? null))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadAvatar();
    function onAvatarUpdated() {
      loadAvatar();
    }
    window.addEventListener("avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("avatar-updated", onAvatarUpdated);
  }, [loadAvatar]);

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
        <button className="relative grid h-10 w-10 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink">
          <Bell className="h-4 w-4" />
        </button>
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
          <AnimatePresence>
            {open ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 top-12 w-60 rounded-panel bg-white border border-hairline p-2"
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
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
