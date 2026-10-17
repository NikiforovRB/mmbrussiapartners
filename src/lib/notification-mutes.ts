import "server-only";

import type { AppNotificationType } from "@prisma/client";
import { db } from "./db";
import { hasAdminScope } from "./permissions";
import { isMutableNotificationTab, mutedNotificationTypes } from "./notification-tabs";

type MuteSource = { notifyMutedTabs: string[]; isSuperAdmin: boolean; role: { permissions: string[] } };

/**
 * Отключённые разделы уведомлений. Отключать их может только администратор:
 * если он стал дилером, оставшаяся настройка не действует.
 */
export function effectiveMutedTabs(user: MuteSource): string[] {
  if (!hasAdminScope(user.role.permissions, user.isSuperAdmin)) return [];
  return user.notifyMutedTabs.filter(isMutableNotificationTab);
}

/** Типы событий, которые пользователь не видит в колокольчике и не считает непрочитанными. */
export async function hiddenNotificationTypes(user: {
  id: string;
  permissions: readonly string[];
  isSuperAdmin: boolean;
}): Promise<AppNotificationType[]> {
  if (!hasAdminScope(user.permissions, user.isSuperAdmin)) return [];
  const row = await db.user.findUnique({ where: { id: user.id }, select: { notifyMutedTabs: true } });
  return mutedNotificationTypes((row?.notifyMutedTabs ?? []).filter(isMutableNotificationTab));
}
