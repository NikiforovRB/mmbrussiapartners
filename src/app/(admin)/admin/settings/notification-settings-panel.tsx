import { db } from "@/lib/db";
import { mergeNotificationSettings } from "@/lib/site-settings";
import { isSmtpConfigured, smtpFrom } from "@/lib/notifications";
import { getTelegramStatus, isTelegramConfigured } from "@/lib/telegram";
import { NotificationSettingsForm } from "./notification-settings-form";

export async function NotificationSettingsPanel() {
  const telegramConfigured = isTelegramConfigured();
  const [settings, telegram, linkedTelegram, emailOn, logs] = await Promise.all([
    db.companySettings.findUnique({ where: { id: "singleton" }, select: { notifications: true } }),
    telegramConfigured ? getTelegramStatus() : Promise.resolve(null),
    db.user.count({ where: { telegramChatId: { not: null }, notifyByTelegram: true } }),
    db.user.count({ where: { status: "APPROVED", notifyByEmail: true } }),
    db.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, channel: true, recipient: true, subject: true, body: true, status: true, error: true, createdAt: true },
    }),
  ]);

  return (
    <NotificationSettingsForm
      initial={mergeNotificationSettings(settings?.notifications)}
      smtp={{ configured: isSmtpConfigured(), host: process.env.SMTP_HOST || null, from: smtpFrom() }}
      telegram={{ configured: telegramConfigured, status: telegram }}
      audience={{ email: emailOn, telegram: linkedTelegram }}
      logs={logs.map((l) => ({
        id: l.id,
        channel: l.channel,
        recipient: l.recipient,
        text: l.subject ?? l.body.slice(0, 120),
        status: l.status,
        error: l.error,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}
