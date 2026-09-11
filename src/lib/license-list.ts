import type { Prisma } from "@prisma/client";

/**
 * Поля, которые нужны таблице лицензий.
 *
 * Выбираем их явно, потому что License.price — это Prisma.Decimal,
 * а серверный компонент не может передать такой объект в клиентский.
 */
export const LICENSE_LIST_SELECT = {
  id: true,
  number: true,
  type: true,
  status: true,
  product: true,
  versionSoftware: true,
  dealerComment: true,
  cancellationReason: true,
  licenseKey: true,
  deletedAt: true,
  dealerId: true,
  issuedWithoutPayment: true,
  repeatGeneration: true,
  // Заявка на аннулирование «на рассмотрении»: по ней в таблице показываем
  // метку и блокируем повторную отправку заявки.
  cancellationRequests: {
    where: { status: "PENDING" },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.LicenseSelect;

/** Строка таблицы: заявку сворачиваем в булев признак ещё на сервере. */
export function toLicenseRow<T extends { cancellationRequests: { id: string }[] }>(
  license: T,
): Omit<T, "cancellationRequests"> & { pendingCancellation: boolean } {
  const { cancellationRequests, ...rest } = license;
  return { ...rest, pendingCancellation: cancellationRequests.length > 0 };
}
