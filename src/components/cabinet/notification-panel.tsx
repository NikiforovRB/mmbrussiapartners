"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bell,
  BadgeCheck,
  CheckCheck,
  ClipboardList,
  CreditCard,
  KeyRound,
  ReceiptText,
  Tags,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRuDateTime } from "@/lib/dates";
import { notificationTabs, tabForType, type NotificationTabId } from "@/lib/notification-tabs";
import { useCabinetUser, useUnreadCount } from "./cabinet-user";

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
  PAYMENT_REFUNDED: <Undo2 className="h-4 w-4" />,
  RECEIPT_FAILED: <ReceiptText className="h-4 w-4" />,
  PRICE_MISSING: <Tags className="h-4 w-4" />,
};

type Feed = {
  items: Notification[];
  hasMore: boolean;
  unread: number;
  unreadByTab: Record<string, number>;
};

export function NotificationPanel({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const cabinetUser = useCabinetUser();
  const tabs = React.useMemo(() => notificationTabs(cabinetUser?.basePath === "/admin"), [cabinetUser?.basePath]);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<NotificationTabId>("all");
  const { unread, setUnread, track, mutate } = useUnreadCount(initialUnread);
  const [items, setItems] = React.useState<Notification[] | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [unreadByTab, setUnreadByTab] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const requestSeq = React.useRef(0);

  // Панель живёт в body: у шапки backdrop-filter, а он делает элемент точкой
  // отсчёта для position: fixed — внутри неё панель схлопывалась в полоску
  // и оставалась под содержимым страницы.
  React.useEffect(() => setMounted(true), []);

  const fetchFeed = React.useCallback(async (forTab: NotificationTabId, before?: string) => {
    const qs = new URLSearchParams({ tab: forTab });
    if (before) qs.set("before", before);
    const res = await fetch(`/api/notifications?${qs}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Feed;
  }, []);

  const load = React.useCallback(
    async (forTab: NotificationTabId) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      const commit = track();
      try {
        const data = await fetchFeed(forTab);
        // Пока ждали ответ, могли переключить вкладку — старый ответ не показываем.
        if (!data || seq !== requestSeq.current) return;
        setItems(data.items);
        setHasMore(data.hasMore);
        setUnreadByTab(data.unreadByTab);
        commit(data.unread);
      } catch {
        /* сеть моргнула — покажем прежнее состояние */
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [fetchFeed, track],
  );

  async function loadMore() {
    const last = items?.[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const seq = requestSeq.current;
    try {
      const data = await fetchFeed(tab, last.createdAt);
      if (!data || seq !== requestSeq.current) return;
      setItems((prev) => [...(prev ?? []), ...data.items.filter((n) => !prev?.some((p) => p.id === n.id))]);
      setHasMore(data.hasMore);
    } catch {
      /* попробуем ещё раз по кнопке */
    } finally {
      setLoadingMore(false);
    }
  }

  // Список каждый раз свежий: пока панель была закрыта, могли прийти новые.
  React.useEffect(() => {
    if (open) void load(tab);
  }, [open, tab, load]);

  function switchTab(next: NotificationTabId) {
    if (next === tab) return;
    setItems(null);
    setHasMore(false);
    setTab(next);
  }

  /** Локально снимаем отметку с одного события во всех счётчиках. */
  function decrementTabs(type: string) {
    const id = tabForType(type);
    setUnreadByTab((prev) => ({
      ...prev,
      all: Math.max(0, (prev.all ?? 0) - 1),
      ...(id ? { [id]: Math.max(0, (prev[id] ?? 0) - 1) } : {}),
    }));
  }

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markRead(body: { ids?: string[]; tab?: NotificationTabId }) {
    return mutate(() =>
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  const tabUnread = unreadByTab[tab] ?? (tab === "all" ? unread : 0);

  async function markAll() {
    const now = new Date().toISOString();
    if (tab === "all") {
      setUnread(0);
      setUnreadByTab((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])));
    } else {
      const cleared = unreadByTab[tab] ?? 0;
      setUnread((v) => Math.max(0, v - cleared));
      setUnreadByTab((prev) => ({ ...prev, [tab]: 0, all: Math.max(0, (prev.all ?? 0) - cleared) }));
    }
    setItems((prev) => prev?.map((n) => (n.readAt ? n : { ...n, readAt: now })) ?? prev);
    await markRead(tab === "all" ? {} : { tab });
  }

  async function openItem(n: Notification) {
    if (!n.readAt) {
      setUnread((v) => Math.max(0, v - 1));
      decrementTabs(n.type);
      setItems((prev) =>
        prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev,
      );
      await markRead({ ids: [n.id] });
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

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[60]">
              <div
                onClick={() => setOpen(false)}
                aria-hidden
                className="absolute inset-0 bg-[#06121f]/55 animate-fade-in"
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label="Уведомления"
                className="absolute inset-y-0 right-0 flex w-full max-w-[800px] flex-col border-l border-hairline bg-white animate-panel-in"
                style={{ boxShadow: "-24px 0 60px -24px rgba(11,16,32,0.28)" }}
              >
                <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
                  <div>
                    <div className="font-display text-lg tracking-tight">Уведомления</div>
                    <div className="text-xs text-ink-muted">
                      {unread > 0 ? `${unread} непрочитанных` : "Всё прочитано"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {tabUnread > 0 ? (
                      <button
                        type="button"
                        onClick={markAll}
                        title={tab === "all" ? "Отметить все прочитанными" : "Отметить прочитанными во вкладке"}
                        className="flex h-9 items-center gap-1.5 rounded-btn px-3 text-[13px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                      >
                        <CheckCheck className="h-4 w-4" />
                        <span className="hidden sm:inline">Прочитать все</span>
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

                <nav
                  role="tablist"
                  aria-label="Разделы уведомлений"
                  className="flex gap-1 overflow-x-auto border-b border-hairline px-3 scrollbar-clean"
                >
                  {tabs.map((t) => {
                    const count = unreadByTab[t.id] ?? 0;
                    const active = t.id === tab;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => switchTab(t.id)}
                        className={cn(
                          "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
                          active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
                        )}
                      >
                        {t.label}
                        {count > 0 ? (
                          <span
                            className={cn(
                              "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] leading-none",
                              active ? "bg-accent text-white" : "bg-surface-muted text-ink-muted",
                            )}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </nav>

                <div className="flex-1 overflow-y-auto scrollbar-clean">
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
                                n.readAt
                                  ? "bg-surface-muted text-ink-subtle"
                                  : "bg-white text-accent",
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
                      {hasMore ? (
                        <li className="px-5 py-3 text-center">
                          <button
                            type="button"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="rounded-btn px-4 py-2 text-sm text-accent transition-colors hover:bg-surface-muted disabled:opacity-50"
                          >
                            {loadingMore ? "Загружаем…" : "Показать ещё"}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <div className="px-5 py-16 text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-panel bg-surface-muted text-ink-subtle">
                        <Bell className="h-5 w-5" />
                      </div>
                      <div className="mt-3 text-sm text-ink-muted">
                        {tab === "all" ? "Пока нет уведомлений" : "В этом разделе пока пусто"}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
