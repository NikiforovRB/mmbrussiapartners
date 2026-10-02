import "server-only";

import type { User } from "@prisma/client";
import { isSmtpConfigured } from "./notifications";
import { isTelegramConfigured } from "./telegram";

/** Пропсы карточки «Уведомления» в профиле: личные настройки и доступность каналов. */
export function notificationPrefsProps(
  user: Pick<User, "email" | "notifyByEmail" | "notifyByTelegram" | "telegramChatId" | "telegramName" | "telegramLinkedAt">,
) {
  return {
    email: user.email,
    initial: {
      notifyByEmail: user.notifyByEmail,
      notifyByTelegram: user.notifyByTelegram,
      telegram: {
        linked: Boolean(user.telegramChatId),
        name: user.telegramName,
        linkedAt: user.telegramLinkedAt?.toISOString() ?? null,
      },
    },
    emailAvailable: isSmtpConfigured(),
    telegramAvailable: isTelegramConfigured(),
  };
}
