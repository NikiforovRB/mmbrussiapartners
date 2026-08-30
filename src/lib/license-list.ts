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
  termStart: true,
  termEnd: true,
  product: true,
  versionSoftware: true,
  customerFio: true,
  customerOrganization: true,
  customerEmail: true,
  customerPhone: true,
  cancellationReason: true,
  licenseKey: true,
  deletedAt: true,
  dealerId: true,
  issuedWithoutPayment: true,
  repeatGeneration: true,
} satisfies Prisma.LicenseSelect;
