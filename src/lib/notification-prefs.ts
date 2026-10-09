import "server-only";

import type { User } from "@prisma/client";
import { isSmtpConfigured } from "./notifications";
import { isTelegramConfigured } from "./telegram";
import { isMaxConfigured } from "./max";

/** Пропсы карточки «Уведомления» в профиле: личные настройки и доступность каналов. */
export function notificationPrefsProps(
  user: Pick<
    User,
    | "email"
    | "notifyByEmail"
    | "notifyByTelegram"
    | "telegramChatId"
    | "telegramName"
    | "telegramLinkedAt"
    | "notifyByMax"
    | "maxUserId"
    | "maxName"
    | "maxLinkedAt"
  >,
) {
  return {
    email: user.email,
    initial: {
      notifyByEmail: user.notifyByEmail,
      notifyByTelegram: user.notifyByTelegram,
      notifyByMax: user.notifyByMax,
      telegram: {
        linked: Boolean(user.telegramChatId),
        name: user.telegramName,
        linkedAt: user.telegramLinkedAt?.toISOString() ?? null,
      },
      max: {
        linked: Boolean(user.maxUserId),
        name: user.maxName,
        linkedAt: user.maxLinkedAt?.toISOString() ?? null,
      },
    },
    emailAvailable: isSmtpConfigured(),
    telegramAvailable: isTelegramConfigured(),
    maxAvailable: isMaxConfigured(),
  };
}
