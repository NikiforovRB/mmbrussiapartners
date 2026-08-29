export const PERMISSIONS = {
  "dealers.view": "Просмотр представителей",
  "dealers.approve": "Одобрение/блокировка представителей",
  "dealers.edit": "Редактирование данных представителя",
  "dealers.suspend": "Блокировка представителей",
  "dealers.setLimit": "Управление лимитами лицензий",
  "licenses.view": "Просмотр лицензий",
  "licenses.create": "Создание лицензий",
  "licenses.edit": "Редактирование лицензий",
  "licenses.cancel": "Аннулирование лицензий",
  "licenses.revoke": "Отзыв лицензий",
  "licenses.delete": "Удаление лицензий",
  "licenses.restore": "Восстановление из корзины",
  "roles.manage": "Управление ролями",
  "users.manage": "Управление пользователями",
  "reports.view": "Просмотр отчётов",
  "reports.export": "Экспорт отчётов",
  "stats.view": "Просмотр статистики",
  "geo.view": "Гео-аналитика",
  "payments.view": "Просмотр платежей",
  "payments.manage": "Подтверждение оплат и фискализация",
  "payments.refund": "Возвраты по платежам",
  "settings.edit": "Настройки компании",
  "auditLog.view": "Журнал аудита",
  "templates.edit": "Редактирование email-шаблонов",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_GROUPS: Record<string, PermissionKey[]> = {
  Представители: [
    "dealers.view",
    "dealers.approve",
    "dealers.edit",
    "dealers.suspend",
    "dealers.setLimit",
  ],
  Лицензии: [
    "licenses.view",
    "licenses.create",
    "licenses.edit",
    "licenses.cancel",
    "licenses.revoke",
    "licenses.delete",
    "licenses.restore",
  ],
  "Доступ и роли": ["roles.manage", "users.manage"],
  "Аналитика и отчёты": ["reports.view", "reports.export", "stats.view", "geo.view"],
  Платежи: ["payments.view", "payments.manage", "payments.refund"],
  Прочее: ["settings.edit", "auditLog.view", "templates.edit"],
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export function hasPermission(
  userPermissions: readonly string[] | undefined | null,
  required: PermissionKey | PermissionKey[],
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!userPermissions) return false;
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => userPermissions.includes(p));
}

export function requireAny(
  userPermissions: readonly string[] | undefined | null,
  any: PermissionKey[],
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!userPermissions) return false;
  return any.some((p) => userPermissions.includes(p));
}
