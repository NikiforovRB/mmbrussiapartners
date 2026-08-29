"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BadgeCheck,
  CheckCheck,
  ClipboardList,
  CreditCard,
  KeyRound,
  ReceiptText,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRuDateTime } from "@/lib/dates";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const ICONS: Record<string, React.ReactNode> = {
  DEALER_REGISTERED: <UserPlus className="h-4 w-4" />,
  DEALER_APPROVED: <BadgeCheck className="h-4 w-4" />,
  DEALER_REJECTED: <BadgeCheck className="h-4 w-4" />,
  DEALER_SUSPENDED: <BadgeCheck className="h-4 w-4" />,
  LICENSE_ISSUED: <KeyRound className="h-4 w-4" />,
  LICENSE_CANCELLED: <KeyRound className="h-4 w-4" />,
  LICENSE_REVOKED: <KeyRound className="h-4 w-4" />,
  CANCELLATION_REQUESTED: <ClipboardList className="h-4 w-4" />,
  CANCELLATION_REVIEWED: <ClipboardList className="h-4 w-4" />,
  PAYMENT_CREATED: <CreditCard className="h-4 w-4" />,
  PAYMENT_PAID: <CreditCard className="h-4 w-4" />,
  RECEIPT_FAILED: <ReceiptText className="h-4 w-4" />,
};

/** Как часто подтягиваем счётчик, пока вкладка открыта. */
const POLL_MS = 60_000;

export function NotificationPanel({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<Notification[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Notification[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      /* сеть моргнула — покажем прежнее состояние */
    } finally {
      setLoading(false);
    }
  }, []);

  // Пока панель закрыта, список не нужен — обновляем только счётчик.
  React.useEffect(() => {
    if (open) return;
    const timer = setInterval(() => {
      fetch("/api/notifications", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { unread: number } | null) => d && setUnread(d.unread))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open]);

  React.useEffect(() => {
    if (open && items === null) void load();
  }, [open, items, load]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function markAll() {
    setUnread(0);
    setItems((prev) =>
      prev?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? prev,
    );
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  async function openItem(n: Notification) {
    if (!n.readAt) {
      setUnread((v) => Math.max(0, v - 1));
      setItems((prev) =>
        prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev,
      );
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        className="relative grid h-10 w-10 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full bg-danger text-[10px] font-medium leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-label="Уведомления"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col bg-white transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ boxShadow: "-24px 0 60px -24px rgba(11,16,32,0.22)" }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div>
            <div className="font-display text-lg tracking-tight">Уведомления</div>
            <div className="text-xs text-ink-muted">
              {unread > 0 ? `${unread} непрочитанных` : "Всё прочитано"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                title="Отметить все прочитанными"
                className="grid h-9 w-9 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              className="grid h-9 w-9 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading && items === null ? (
            <div className="px-5 py-10 text-center text-sm text-ink-muted">Загружаем…</div>
          ) : items && items.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-muted",
                      !n.readAt && "bg-card-light",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-panel",
                        n.readAt ? "bg-surface-muted text-ink-subtle" : "bg-white text-accent",
                      )}
                    >
                      {ICONS[n.type] ?? <Bell className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug">{n.title}</span>
                      {n.body ? (
                        <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="mt-1.5 block text-[11px] text-ink-subtle">
                        {formatRuDateTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.readAt ? (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-panel bg-surface-muted text-ink-subtle">
                <Bell className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm text-ink-muted">Пока нет уведомлений</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
