import "server-only";

import type { AppNotificationType } from "@prisma/client";
import { db } from "./db";

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
  } catch (err) {
    console.error("[notifications] не удалось создать уведомление", err);
  }
}

/**
 * Рассылает событие всем, кто способен на него отреагировать: суперадминам и
 * обладателям одного из указанных прав. Дилеры сюда не попадают.
 */
export async function notifyAdmins(
  permissions: string[],
  input: NotifyInput,
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: {
        status: "APPROVED",
        OR: [{ isSuperAdmin: true }, { role: { permissions: { hasSome: permissions } } }],
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
  } catch (err) {
    console.error("[notifications] не удалось разослать уведомление админам", err);
  }
}
