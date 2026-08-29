export const PERMISSIONS = {
  "dealers.view": "Просмотр представителей",
  "dealers.approve": "Одобрение/блокировка представителей",
  "dealers.edit": "Редактирование данных представителя",
  "dealers.suspend": "Блокировка представителей",
  "dealers.setLimit": "Управление лимитами лицензий",
  "licenses.view": "Просмотр лицензий",
  "licenses.create": "Создание лицензий",
  "licenses.edit": "Редактирование карточки лицензии",
  "licenses.manageTerms": "Изменение статуса, срока и типа лицензии",
  "licenses.cancel": "Аннулирование лицензий",
  "licenses.revoke": "Отзыв лицензий",
  "licenses.delete": "Удаление лицензий",
  "licenses.restore": "Восстановление из корзины",
  "licenses.issueFree": "Выдача лицензий без оплаты",
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
    "licenses.manageTerms",
    "licenses.cancel",
    "licenses.revoke",
    "licenses.delete",
    "licenses.restore",
    "licenses.issueFree",
  ],
  "Доступ и роли": ["roles.manage", "users.manage"],
  "Аналитика и отчёты": ["reports.view", "reports.export", "stats.view", "geo.view"],
  Платежи: ["payments.view", "payments.manage", "payments.refund"],
  Прочее: ["settings.edit", "auditLog.view", "templates.edit"],
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * Права, которыми представитель пользуется в собственном кабинете: свои
 * лицензии, свои отчёты, свои счета описаны теми же ключами, что и у
 * администратора.
 *
 * Отличать администратора по ним нельзя. Проверка вида
 * `isOwner || can("licenses.view")` для представителя всегда истинна, то есть
 * «право видеть своё» открывало бы и чужое.
 */
export const DEALER_SCOPE_PERMISSIONS: PermissionKey[] = [
  "licenses.view",
  "licenses.create",
  "licenses.edit",
  "reports.view",
  "payments.view",
];

/** Права, которые выходят за пределы своего кабинета — только у администратора. */
export const ADMIN_SCOPE_PERMISSIONS: PermissionKey[] = ALL_PERMISSIONS.filter(
  (p) => !DEALER_SCOPE_PERMISSIONS.includes(p),
);

/**
 * Работает ли пользователь с сетью представителей, а не только со своими
 * данными. Единственный допустимый признак «это администратор».
 */
export function hasAdminScope(
  userPermissions: readonly string[] | undefined | null,
  isSuperAdmin = false,
): boolean {
  return requireAny(userPermissions, ADMIN_SCOPE_PERMISSIONS, isSuperAdmin);
}

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
