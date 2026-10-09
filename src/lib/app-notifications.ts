import "server-only";

import { after } from "next/server";
import type { AppNotificationType } from "@prisma/client";
import { db } from "./db";
import { ADMIN_SCOPE_PERMISSIONS, type PermissionKey } from "./permissions";
import { cabinetUrl } from "./cabinet-origin";
import { mergeNotificationSettings } from "./site-settings";
import {
  isSmtpConfigured,
  notificationEmailHtml,
  notificationTelegramText,
  sendEmail,
  sendMax,
  sendTelegram,
} from "./notifications";
import { isTelegramConfigured } from "./telegram";
import { isMaxConfigured } from "./max";

type NotifyInput = {
  type: AppNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/**
 * Уведомления в колокольчике — вспомогательный канал: если запись не создалась,
 * основное действие (выдача лицензии, подтверждение оплаты) всё равно должно
 * завершиться успехом. Поэтому все ошибки здесь гасятся с записью в лог.
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  try {
    await db.appNotification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
    deliverInBackground([userId], input);
  } catch (err) {
    console.error("[notifications] не удалось создать уведомление", err);
  }
}

/**
 * Рассылает событие всем, кто способен на него отреагировать: суперадминам и
 * обладателям одного из указанных прав. Дилеры сюда не попадают, даже если
 * указано право, которое есть и у них (licenses.view и т. п.): события
 * админской ленты касаются чужих лицензий и дилеров.
 */
export async function notifyAdmins(
  permissions: PermissionKey[],
  input: NotifyInput,
  opts: { exceptUserId?: string } = {},
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: {
        status: "APPROVED",
        ...(opts.exceptUserId ? { id: { not: opts.exceptUserId } } : {}),
        OR: [
          { isSuperAdmin: true },
          {
            AND: [
              { role: { permissions: { hasSome: permissions } } },
              { role: { permissions: { hasSome: ADMIN_SCOPE_PERMISSIONS } } },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await db.appNotification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      })),
    });
    deliverInBackground(
      admins.map((a) => a.id),
      input,
    );
  } catch (err) {
    console.error("[notifications] не удалось разослать уведомление админам", err);
  }
}

/** Почта и мессенджеры получают уведомление после ответа клиенту: SMTP и боты не задерживают действие. */
function deliverInBackground(userIds: string[], input: NotifyInput) {
  if (!isSmtpConfigured() && !isTelegramConfigured() && !isMaxConfigured()) return;
  const task = () =>
    deliverExternal(userIds, input).catch((err) =>
      console.error("[notifications] доставка на почту/в мессенджеры упала", err),
    );
  try {
    after(task);
  } catch {
    void task();
  }
}

async function deliverExternal(userIds: string[], input: NotifyInput) {
  const settingsRow = await db.companySettings.findUnique({
    where: { id: "singleton" },
    select: { notifications: true },
  });
  const settings = mergeNotificationSettings(settingsRow?.notifications);
  const byEmail = settings.emailEnabled && !settings.emailOff.includes(input.type) && isSmtpConfigured();
  const byTelegram =
    settings.telegramEnabled && !settings.telegramOff.includes(input.type) && isTelegramConfigured();
  const byMax = settings.maxEnabled && !settings.maxOff.includes(input.type) && isMaxConfigured();
  if (!byEmail && !byTelegram && !byMax) return;

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      notifyByEmail: true,
      notifyByTelegram: true,
      telegramChatId: true,
      notifyByMax: true,
      maxUserId: true,
    },
  });
  const url = input.link ? cabinetUrl(input.link) : null;
  const message = { title: input.title, body: input.body ?? null, url };

  for (const u of users) {
    if (byEmail && u.notifyByEmail) {
      await sendEmail({
        to: u.email,
        subject: input.title,
        html: notificationEmailHtml({
          ...message,
          footer: "Письмо отправлено автоматически. Отключить уведомления на почту можно в профиле кабинета.",
        }),
        text: [input.title, input.body, url].filter(Boolean).join("\n\n"),
        userId: u.id,
      });
    }
    if (byTelegram && u.notifyByTelegram && u.telegramChatId) {
      await sendTelegram({ chatId: u.telegramChatId, text: notificationTelegramText(message), userId: u.id });
    }
    if (byMax && u.notifyByMax && u.maxUserId) {
      await sendMax({ maxUserId: u.maxUserId, ...message, userId: u.id });
    }
  }
}
