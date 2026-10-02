"use client";

import * as React from "react";
import { Mail, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { formatRuDate } from "@/lib/dates";

export type TelegramLink = { linked: boolean; name: string | null; linkedAt: string | null };

const POLL_MS = 3_000;
const POLL_FOR_MS = 3 * 60_000;

export function NotificationPrefsCard({
  email,
  initial,
  emailAvailable,
  telegramAvailable,
}: {
  email: string;
  initial: { notifyByEmail: boolean; notifyByTelegram: boolean; telegram: TelegramLink };
  /** SMTP настроен на сервере. */
  emailAvailable: boolean;
  /** Бот подключён (есть прокси Telegram). */
  telegramAvailable: boolean;
}) {
  const [byEmail, setByEmail] = React.useState(initial.notifyByEmail);
  const [byTelegram, setByTelegram] = React.useState(initial.notifyByTelegram);
  const [telegram, setTelegram] = React.useState(initial.telegram);
  const [busy, setBusy] = React.useState<string | null>(null);
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

  async function savePrefs(patch: { notifyByEmail?: boolean; notifyByTelegram?: boolean }) {
    setBusy("prefs");
    const res = await fetch("/api/profile/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return false;
    }
    return true;
  }

  async function connect() {
    // Вкладку открываем сразу по клику: после await браузер счёл бы её всплывающим окном.
    const tab = window.open("about:blank", "_blank");
    setBusy("link");
    const res = await fetch("/api/profile/telegram", { method: "POST" });
    setBusy(null);
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
      const s = await fetch("/api/profile/telegram").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (s?.linked) {
        stopPolling();
        setTelegram({ linked: true, name: s.name, linkedAt: s.linkedAt });
        setByTelegram(Boolean(s.enabled));
        toast.success("Telegram подключён");
      }
    }, POLL_MS);
  }

  async function disconnect() {
    setBusy("unlink");
    const res = await fetch("/api/profile/telegram", { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      toast.error("Не удалось отключить Telegram");
      return;
    }
    setTelegram({ linked: false, name: null, linkedAt: null });
    setByTelegram(false);
    toast.success("Telegram отключён");
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
          disabled={busy === "prefs"}
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

        <div className="border-t border-hairline pt-4">
          {telegram.linked ? (
            <>
              <Toggle
                checked={byTelegram}
                disabled={busy === "prefs"}
                onChange={async (v) => {
                  setByTelegram(v);
                  if (!(await savePrefs({ notifyByTelegram: v }))) setByTelegram(!v);
                }}
                label={
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" /> В Telegram
                  </span>
                }
                description={[
                  telegram.name ? `Подключён: ${telegram.name}` : "Подключён",
                  telegram.linkedAt ? `с ${formatRuDate(telegram.linkedAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <button
                type="button"
                onClick={disconnect}
                disabled={busy === "unlink"}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" /> Отключить Telegram
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Send className="h-4 w-4" /> Telegram
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {telegramAvailable
                  ? waiting
                    ? "Откройте бота и нажмите «Запустить» (Start) — подключение появится здесь само."
                    : "Откройте бота по ссылке и нажмите «Запустить»: уведомления начнут приходить в этот чат."
                  : "Бот уведомлений пока не подключён администратором."}
              </p>
              {telegramAvailable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  loading={busy === "link"}
                  icon={<Send className="h-4 w-4" />}
                  onClick={connect}
                >
                  {waiting ? "Открыть бота ещё раз" : "Подключить Telegram"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
