/** Роль, которую дилер получает при регистрации. */
export const DEALER_ROLE_NAME = "Дилер";

/** Прежнее название роли дилера: оно остаётся в базе до применения миграции. */
const LEGACY_DEALER_ROLE_NAME = "Представитель";

export const DEALER_ROLE_NAMES = [DEALER_ROLE_NAME, LEGACY_DEALER_ROLE_NAME];

export function isDealerRoleName(name: string | null | undefined): boolean {
  return Boolean(name) && DEALER_ROLE_NAMES.includes(name!);
}
