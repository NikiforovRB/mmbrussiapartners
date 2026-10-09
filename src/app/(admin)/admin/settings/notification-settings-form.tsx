"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Send, Save, Webhook } from "lucide-react";
import { toast } from "sonner";
import type { AppNotificationType } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Toggle } from "@/components/ui/toggle";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/use-permissions";
import { formatRuDateTime } from "@/lib/dates";
import { NOTIFICATION_TAB_TYPES, NOTIFICATION_TYPE_LABEL } from "@/lib/notification-tabs";
import type { NotificationSettings } from "@/lib/site-settings";

type TelegramStatus = {
  bot: string | null;
  webhookUrl: string | null;
  pending: number;
  lastError: string | null;
  error: string | null;
};

type MaxStatus = {
  bot: string | null;
  botName: string | null;
  webhookUrl: string | null;
  webhookOk: boolean;
  error: string | null;
};

const CHANNEL_LABEL: Record<string, string> = { EMAIL: "Почта", TELEGRAM: "Telegram", MAX: "MAX" };

type LogRow = {
  id: string;
  channel: string;
  recipient: string;
  text: string;
  status: string;
  error: string | null;
  createdAt: string;
};

const STATUS_TONE: Record<string, "success" | "danger" | "muted"> = { SENT: "success", FAILED: "danger", QUEUED: "muted" };
const STATUS_LABEL: Record<string, string> = { SENT: "отправлено", FAILED: "ошибка", QUEUED: "в очереди" };

export function NotificationSettingsForm({
  initial,
  smtp,
  telegram,
  max,
  audience,
  logs,
}: {
  initial: NotificationSettings;
  smtp: { configured: boolean; host: string | null; from: string };
  telegram: { configured: boolean; status: TelegramStatus | null };
  max: { configured: boolean; status: MaxStatus | null; webhookUrl: string };
  audience: { email: number; telegram: number; max: number };
  logs: LogRow[];
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [emailEnabled, setEmailEnabled] = React.useState(initial.emailEnabled);
  const [telegramEnabled, setTelegramEnabled] = React.useState(initial.telegramEnabled);
  const [maxEnabled, setMaxEnabled] = React.useState(initial.maxEnabled);
  const [emailOff, setEmailOff] = React.useState<string[]>(initial.emailOff);
  const [telegramOff, setTelegramOff] = React.useState<string[]>(initial.telegramOff);
  const [maxOff, setMaxOff] = React.useState<string[]>(initial.maxOff);
  const [busy, setBusy] = React.useState<string | null>(null);

  const toggleType = (list: string[], set: (v: string[]) => void, type: AppNotificationType, on: boolean) =>
    set(on ? list.filter((t) => t !== type) : [...list, type]);

  async function post(url: string, body: unknown, key: string, method = "POST") {
    setBusy(key);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Ошибка");
      return null;
    }
    return j;
  }

  async function save() {
    const body = { emailEnabled, telegramEnabled, maxEnabled, emailOff, telegramOff, maxOff };
    if (await post("/api/settings/notifications", body, "save", "PATCH")) {
      toast.success("Сохранено");
      router.refresh();
    }
  }

  async function test(channel: "email" | "telegram" | "max") {
    const j = await post("/api/settings/notifications/test", { channel }, `test-${channel}`);
    if (j) {
      toast.success(
        channel === "email"
          ? `Письмо отправлено на ${j.to}`
          : `Сообщение отправлено в ${channel === "max" ? "MAX" : "Telegram"}`,
      );
      router.refresh();
    }
  }

  async function setupWebhook() {
    if (await post("/api/settings/notifications/telegram-setup", {}, "webhook")) {
      toast.success("Вебхук бота подключён");
      router.refresh();
    }
  }

  async function setupMaxWebhook() {
    if (await post("/api/settings/notifications/max-setup", {}, "max-webhook")) {
      toast.success("Вебхук бота MAX подключён");
      router.refresh();
    }
  }

  const tg = telegram.status;
  const mx = max.status;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Почта</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {smtp.configured ? <Tag tone="success">SMTP настроен</Tag> : <Tag tone="warning">SMTP не настроен</Tag>}
          <Tag tone="muted">Отправитель: {smtp.from}</Tag>
          {smtp.host ? <Tag tone="muted">Сервер: {smtp.host}</Tag> : null}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {smtp.configured
            ? `Письма получают пользователи с включённой почтой в профиле: сейчас ${audience.email}.`
            : "Задайте на сервере SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и при необходимости SMTP_FROM — после перезапуска письма начнут уходить."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Toggle checked={emailEnabled} onChange={setEmailEnabled} disabled={!canEdit} label="Отправлять уведомления на почту" />
        </div>
        <Button
          className="mt-4"
          size="sm"
          variant="secondary"
          disabled={!smtp.configured || !canEdit}
          loading={busy === "test-email"}
          icon={<Mail className="h-4 w-4" />}
          onClick={() => test("email")}
        >
          Отправить тестовое письмо себе
        </Button>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Send className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Telegram</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {!telegram.configured ? (
            <Tag tone="warning">Прокси не настроен</Tag>
          ) : tg?.error ? (
            <Tag tone="danger">Воркер не отвечает</Tag>
          ) : (
            <Tag tone="success">Бот @{tg?.bot}</Tag>
          )}
          {telegram.configured && !tg?.error ? (
            tg?.webhookUrl ? <Tag tone="muted">Вебхук подключён</Tag> : <Tag tone="warning">Вебхук не подключён</Tag>
          ) : null}
          {tg?.pending ? <Tag tone="warning">В очереди у Telegram: {tg.pending}</Tag> : null}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {!telegram.configured
            ? "Сообщения идут через воркер Cloudflare: задайте на сервере TELEGRAM_PROXY_URL и TELEGRAM_PROXY_SECRET."
            : tg?.error
              ? `Ошибка: ${tg.error}`
              : `Каждый подключает свой Telegram в профиле кабинета. Подключено: ${audience.telegram}.`}
        </p>
        {tg?.lastError ? <p className="mt-1 text-xs text-danger">Последняя ошибка вебхука: {tg.lastError}</p> : null}
        <div className="mt-4">
          <Toggle
            checked={telegramEnabled}
            onChange={setTelegramEnabled}
            disabled={!canEdit}
            label="Отправлять уведомления в Telegram"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!telegram.configured || !canEdit}
            loading={busy === "webhook"}
            icon={<Webhook className="h-4 w-4" />}
            onClick={setupWebhook}
          >
            {tg?.webhookUrl ? "Переподключить вебхук" : "Подключить вебхук бота"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!telegram.configured || !canEdit}
            loading={busy === "test-telegram"}
            icon={<Send className="h-4 w-4" />}
            onClick={() => test("telegram")}
          >
            Тест себе
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">MAX</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {!max.configured ? (
            <Tag tone="warning">Бот не настроен</Tag>
          ) : mx?.error ? (
            <Tag tone="danger">MAX не отвечает</Tag>
          ) : (
            <Tag tone="success">Бот {mx?.bot ? `@${mx.bot}` : mx?.botName}</Tag>
          )}
          {max.configured && !mx?.error ? (
            mx?.webhookOk ? (
              <Tag tone="muted">Вебхук подключён</Tag>
            ) : (
              <Tag tone="warning">{mx?.webhookUrl ? "Вебхук смотрит не сюда" : "Вебхук не подключён"}</Tag>
            )
          ) : null}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {!max.configured
            ? "Задайте на сервере MAX_BOT_TOKEN (токен бота из business.max.ru) и MAX_WEBHOOK_SECRET, перезапустите кабинет и подключите вебхук."
            : mx?.error
              ? `Ошибка: ${mx.error}`
              : `Каждый подключает свой MAX в профиле кабинета. Подключено: ${audience.max}.`}
        </p>
        {max.configured && mx?.webhookUrl && !mx.webhookOk ? (
          <p className="mt-1 text-xs text-warning">
            Сейчас события уходят на {mx.webhookUrl}, а нужно на {max.webhookUrl}.
          </p>
        ) : null}
        <div className="mt-4">
          <Toggle checked={maxEnabled} onChange={setMaxEnabled} disabled={!canEdit} label="Отправлять уведомления в MAX" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!max.configured || !canEdit}
            loading={busy === "max-webhook"}
            icon={<Webhook className="h-4 w-4" />}
            onClick={setupMaxWebhook}
          >
            {mx?.webhookOk ? "Переподключить вебхук" : "Подключить вебхук бота"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!max.configured || !canEdit}
            loading={busy === "test-max"}
            icon={<MessageCircle className="h-4 w-4" />}
            onClick={() => test("max")}
          >
            Тест себе
          </Button>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <div className="font-display text-lg tracking-tight mb-1">События</div>
        <p className="text-sm text-ink-muted mb-4">
          Уведомление уходит в канал, если он включён здесь и у пользователя в профиле. В колокольчике кабинета
          события есть всегда.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-normal">Событие</th>
                <th className="w-28 py-2 px-3 font-normal">Почта</th>
                <th className="w-28 py-2 px-3 font-normal">Telegram</th>
                <th className="w-28 py-2 px-3 font-normal">MAX</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TAB_TYPES.map((group) => (
                <React.Fragment key={group.id}>
                  <tr>
                    <td colSpan={4} className="pt-4 pb-1 text-[11px] uppercase tracking-widest text-ink-subtle">
                      {group.label.admin}
                    </td>
                  </tr>
                  {group.types.map((type) => (
                    <tr key={type} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-3">{NOTIFICATION_TYPE_LABEL[type]}</td>
                      <td className="py-2 px-3">
                        <Checkbox
                          size="sm"
                          checked={!emailOff.includes(type)}
                          disabled={!canEdit || !emailEnabled}
                          onChange={(on) => toggleType(emailOff, setEmailOff, type, on)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Checkbox
                          size="sm"
                          checked={!telegramOff.includes(type)}
                          disabled={!canEdit || !telegramEnabled}
                          onChange={(on) => toggleType(telegramOff, setTelegramOff, type, on)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Checkbox
                          size="sm"
                          checked={!maxOff.includes(type)}
                          disabled={!canEdit || !maxEnabled}
                          onChange={(on) => toggleType(maxOff, setMaxOff, type, on)}
                        />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex justify-end">
          <Button loading={busy === "save"} disabled={!canEdit} icon={<Save className="h-4 w-4" />} onClick={save}>
            Сохранить
          </Button>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <div className="font-display text-lg tracking-tight mb-3">Последние отправки</div>
        {logs.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-muted">Отправок ещё не было</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-2 pr-3 font-normal">Когда</th>
                  <th className="py-2 px-3 font-normal">Канал</th>
                  <th className="py-2 px-3 font-normal">Кому</th>
                  <th className="py-2 px-3 font-normal">Текст</th>
                  <th className="py-2 pl-3 font-normal">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {logs.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatRuDateTime(l.createdAt)}</td>
                    <td className="py-2 px-3">{CHANNEL_LABEL[l.channel] ?? l.channel}</td>
                    <td className="py-2 px-3 max-w-[200px] truncate" title={l.recipient}>
                      {l.recipient}
                    </td>
                    <td className="py-2 px-3 max-w-[280px]">
                      <div className="line-clamp-2 break-words" title={l.text}>
                        {l.text}
                      </div>
                    </td>
                    <td className="py-2 pl-3">
                      <Tag tone={STATUS_TONE[l.status] ?? "muted"} className="px-2 py-0.5 text-[11px]">
                        {STATUS_LABEL[l.status] ?? l.status}
                      </Tag>
                      {l.error ? (
                        <div className="mt-1 max-w-[220px] line-clamp-2 break-words text-[11px] text-danger" title={l.error}>
                          {l.error}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
