"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, Unlink } from "lucide-react";
import { toast } from "sonner";
import { MaxIcon, TelegramIcon } from "@/components/brand/messenger-icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { formatRuDate } from "@/lib/dates";
import { MUTABLE_NOTIFICATION_TABS, type MutableNotificationTab } from "@/lib/notification-tabs";
import { useUnreadCount } from "./cabinet-user";

export type MessengerLink = { linked: boolean; name: string | null; linkedAt: string | null };

const POLL_MS = 3_000;
const POLL_FOR_MS = 3 * 60_000;

type PrefsPatch = {
  notifyByEmail?: boolean;
  notifyByTelegram?: boolean;
  notifyByMax?: boolean;
  mutedTabs?: MutableNotificationTab[];
};

const SECTION_HINT: Record<MutableNotificationTab, { label: string; description: string }> = {
  licenses: {
    label: "Лицензии",
    description: "Выдача без оплаты и повторная генерация, отказы DriveMods, аннулирование и заявки на него",
  },
  payments: {
    label: "Оплаты",
    description: "Новые счета и изменение стоимости, оплаты, возвраты, непробитые чеки, нет цены в справочнике",
  },
};

export function NotificationPrefsCard({
  email,
  initial,
  emailAvailable,
  telegramAvailable,
  maxAvailable,
  mutedTabs: initialMuted,
}: {
  email: string;
  initial: {
    notifyByEmail: boolean;
    notifyByTelegram: boolean;
    notifyByMax: boolean;
    telegram: MessengerLink;
    max: MessengerLink;
  };
  /** SMTP настроен на сервере. */
  emailAvailable: boolean;
  /** Бот подключён (есть прокси Telegram). */
  telegramAvailable: boolean;
  /** Бот MAX настроен на сервере. */
  maxAvailable: boolean;
  /** Отключённые разделы; null — не администратор, разделы не отключаются. */
  mutedTabs: MutableNotificationTab[] | null;
}) {
  const router = useRouter();
  const { refresh: refreshUnread } = useUnreadCount(0);
  const [byEmail, setByEmail] = React.useState(initial.notifyByEmail);
  const [muted, setMuted] = React.useState(initialMuted ?? []);
  const [busy, setBusy] = React.useState(false);

  async function toggleSection(tab: MutableNotificationTab, on: boolean) {
    const prev = muted;
    const next = on ? muted.filter((t) => t !== tab) : [...muted, tab];
    setMuted(next);
    if (!(await savePrefs({ mutedTabs: next }))) {
      setMuted(prev);
      return;
    }
    // Колокольчик берёт разделы из раскладки, а счётчик — с сервера.
    router.refresh();
    void refreshUnread();
  }

  async function savePrefs(patch: PrefsPatch) {
    setBusy(true);
    const res = await fetch("/api/profile/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return false;
    }
    return true;
  }

  return (
    <Card>
      <div className="font-display text-lg tracking-tight mb-1">Уведомления</div>
      <p className="text-xs text-ink-muted mb-4">
        Те же события, что в колокольчике: заявки, лицензии, счета и оплаты.
      </p>
      <div className="space-y-5">
        <Toggle
          checked={byEmail}
          disabled={busy}
          onChange={async (v) => {
            setByEmail(v);
            if (!(await savePrefs({ notifyByEmail: v }))) setByEmail(!v);
          }}
          label={
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> На почту
            </span>
          }
          description={emailAvailable ? `На ${email}` : `На ${email} — начнут приходить, когда администратор настроит почту`}
        />

        <MessengerSection
          title="Telegram"
          icon={<TelegramIcon className="h-4 w-4" />}
          endpoint="/api/profile/telegram"
          prefKey="notifyByTelegram"
          available={telegramAvailable}
          initialLink={initial.telegram}
          initialEnabled={initial.notifyByTelegram}
          startHint="нажмите «Запустить» (Start)"
          savePrefs={savePrefs}
          busy={busy}
        />

        {maxAvailable || initial.max.linked ? (
          <MessengerSection
            title="MAX"
            icon={<MaxIcon className="h-4 w-4" />}
            endpoint="/api/profile/max"
            prefKey="notifyByMax"
            available={maxAvailable}
            initialLink={initial.max}
            initialEnabled={initial.notifyByMax}
            startHint="нажмите «Начать»"
            savePrefs={savePrefs}
            busy={busy}
          />
        ) : null}

        {initialMuted ? (
          <div className="border-t border-hairline pt-4">
            <div className="text-sm">Разделы уведомлений</div>
            <p className="mt-1 text-xs text-ink-muted">
              Выключенный раздел пропадает из колокольчика, и его события не приходят ни на почту, ни в Telegram, ни в
              MAX. Настройка действует только для вас.
            </p>
            <div className="mt-4 space-y-4">
              {MUTABLE_NOTIFICATION_TABS.map((tab) => (
                <Toggle
                  key={tab}
                  checked={!muted.includes(tab)}
                  disabled={busy}
                  onChange={(v) => void toggleSection(tab, v)}
                  label={SECTION_HINT[tab].label}
                  description={SECTION_HINT[tab].description}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Привязка чата с ботом: одноразовая ссылка, ожидание подключения, переключатель и отвязка. */
function MessengerSection({
  title,
  icon,
  endpoint,
  prefKey,
  available,
  initialLink,
  initialEnabled,
  startHint,
  savePrefs,
  busy,
}: {
  title: string;
  icon: React.ReactNode;
  endpoint: string;
  prefKey: "notifyByTelegram" | "notifyByMax";
  available: boolean;
  initialLink: MessengerLink;
  initialEnabled: boolean;
  startHint: string;
  savePrefs: (patch: PrefsPatch) => Promise<boolean>;
  busy: boolean;
}) {
  const [link, setLink] = React.useState(initialLink);
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [action, setAction] = React.useState<"link" | "unlink" | null>(null);
  const [waiting, setWaiting] = React.useState(false);
  const pollRef = React.useRef<number | null>(null);

  React.useEffect(() => () => stopPollingTimer(), []);

  function stopPollingTimer() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function stopPolling() {
    stopPollingTimer();
    setWaiting(false);
  }

  async function connect() {
    // Вкладку открываем сразу по клику: после await браузер счёл бы её всплывающим окном.
    const tab = window.open("about:blank", "_blank");
    setAction("link");
    const res = await fetch(endpoint, { method: "POST" });
    setAction(null);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.url) {
      tab?.close();
      toast.error(j.error ?? "Не удалось получить ссылку на бота");
      return;
    }
    if (tab) tab.location.href = j.url;
    else window.location.assign(j.url);
    setWaiting(true);
    const startedAt = Date.now();
    stopPollingTimer();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - startedAt > POLL_FOR_MS) {
        stopPolling();
        return;
      }
      const s = await fetch(endpoint).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (s?.linked) {
        stopPolling();
        setLink({ linked: true, name: s.name, linkedAt: s.linkedAt });
        setEnabled(Boolean(s.enabled));
        toast.success(`${title} подключён`);
      }
    }, POLL_MS);
  }

  async function disconnect() {
    setAction("unlink");
    const res = await fetch(endpoint, { method: "DELETE" });
    setAction(null);
    if (!res.ok) {
      toast.error(`Не удалось отключить ${title}`);
      return;
    }
    setLink({ linked: false, name: null, linkedAt: null });
    setEnabled(false);
    toast.success(`${title} отключён`);
  }

  return (
    <div className="border-t border-hairline pt-4">
      {link.linked ? (
        <>
          <Toggle
            checked={enabled}
            disabled={busy}
            onChange={async (v) => {
              setEnabled(v);
              if (!(await savePrefs({ [prefKey]: v }))) setEnabled(!v);
            }}
            label={
              <span className="flex items-center gap-2">
                {icon} В {title}
              </span>
            }
            description={[
              link.name ? `Подключён: ${link.name}` : "Подключён",
              link.linkedAt ? `с ${formatRuDate(link.linkedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <button
            type="button"
            onClick={disconnect}
            disabled={action === "unlink"}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" /> Отключить {title}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            {icon} {title}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {available
              ? waiting
                ? `Откройте бота и ${startHint} — подключение появится здесь само.`
                : `Откройте бота по ссылке и ${startHint}: уведомления начнут приходить в этот чат.`
              : "Бот уведомлений пока не подключён администратором."}
          </p>
          {available ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              loading={action === "link"}
              icon={icon}
              onClick={connect}
            >
              {waiting ? "Открыть бота ещё раз" : `Подключить ${title}`}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
