/**
 * Публичный адрес кабинета. Нужен там, где после действия пользователя надо
 * увести браузер на боевой домен, а не на тот, с которого открыта страница:
 * NEXTAUTH_URL в разработке указывает на localhost, и выход из профиля
 * возвращал бы дилера на локальный адрес.
 *
 * Переопределяется через NEXT_PUBLIC_CABINET_URL (значение подставляется
 * на сборке, поэтому переменная обязана быть с префиксом NEXT_PUBLIC_).
 */
export const CABINET_URL = (
  process.env.NEXT_PUBLIC_CABINET_URL ?? "https://cabinet.mmbrussia.ru"
).replace(/\/+$/, "");

export function cabinetUrl(path = "/"): string {
  return `${CABINET_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
