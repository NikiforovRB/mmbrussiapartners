import type { Prisma } from "@prisma/client";
import { LICENSE_STATUSES } from "./status-labels";
import { fioFromParts } from "./utils";

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
  bundle: true,
  versionSoftware: true,
  versionCustom: true,
  dealerComment: true,
  cancellationReason: true,
  licenseKey: true,
  deletedAt: true,
  dealerId: true,
  issuedWithoutPayment: true,
  repeatGeneration: true,
  price: true,
  createdAt: true,
  dealer: {
    select: {
      email: true,
      dealerProfile: { select: { firstName: true, lastName: true, middleName: true, city: true } },
    },
  },
  // Заявка на аннулирование «на рассмотрении»: по ней в таблице показываем
  // метку и блокируем повторную отправку заявки.
  cancellationRequests: {
    where: { status: "PENDING" },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.LicenseSelect;

type LicenseListRecord = Prisma.LicenseGetPayload<{ select: typeof LICENSE_LIST_SELECT }>;

/** Строка таблицы: заявку сворачиваем в признак, цену — в число, представителя — в подпись. */
export function toLicenseRow(license: LicenseListRecord) {
  const { cancellationRequests, dealer, price, createdAt, ...rest } = license;
  const p = dealer.dealerProfile;
  const fio = fioFromParts({ firstName: p?.firstName, lastName: p?.lastName, middleName: p?.middleName });
  return {
    ...rest,
    price: price === null ? null : Number(price),
    createdAt: createdAt.toISOString(),
    dealerName: fio || dealer.email,
    dealerSub: fio ? [dealer.email, p?.city].filter(Boolean).join(" · ") : (p?.city ?? ""),
    pendingCancellation: cancellationRequests.length > 0,
  };
}

export type LicenseListParams = {
  q?: string;
  status?: string;
  type?: string;
  product?: string;
  dealers?: string;
  page?: string;
};

/** «id1,id2» из адреса → список id; лишнее отбрасываем, чтобы не раздувать запрос. */
export function parseDealerIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 200);
}

/**
 * Фильтр списка лицензий. dealerId — кабинет представителя: только свои
 * лицензии, фильтр по представителям тогда не действует.
 */
export function licenseListWhere(sp: LicenseListParams, dealerId?: string): Prisma.LicenseWhereInput {
  const where: Prisma.LicenseWhereInput = { deletedAt: null };
  if (dealerId) {
    where.dealerId = dealerId;
  } else {
    const ids = parseDealerIds(sp.dealers);
    if (ids.length > 0) where.dealerId = { in: ids };
  }
  if (sp.status && (LICENSE_STATUSES as readonly string[]).includes(sp.status)) {
    where.status = sp.status as Prisma.LicenseWhereInput["status"];
  }
  // Тип фильтра — синтетический: «Повторная генерация» это флаг, а не поле type.
  if (sp.type === "repeat") where.repeatGeneration = true;
  else if (sp.type === "gen") where.repeatGeneration = false;
  if (sp.product?.trim()) where.product = sp.product.trim();
  const q = sp.q?.trim();
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { product: { contains: q, mode: "insensitive" } },
      { dealerComment: { contains: q, mode: "insensitive" } },
      { versionSoftware: { contains: q, mode: "insensitive" } },
      ...(dealerId
        ? []
        : [
            { dealer: { email: { contains: q, mode: "insensitive" as const } } },
            { dealer: { dealerProfile: { lastName: { contains: q, mode: "insensitive" as const } } } },
          ]),
    ];
  }
  return where;
}
