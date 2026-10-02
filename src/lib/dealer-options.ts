import "server-only";
import { db } from "./db";
import { fioFromParts } from "./utils";
import type { DealerOption } from "@/components/ui/dealer-multi-select";

/** Представители для фильтров «Представители»: ФИО, ниже организация и город. */
export async function loadDealerOptions(): Promise<DealerOption[]> {
  const users = await db.user.findMany({
    where: { dealerProfile: { isNot: null } },
    select: {
      id: true,
      email: true,
      dealerProfile: {
        select: { firstName: true, lastName: true, middleName: true, organization: true, city: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return users.map((u) => {
    const p = u.dealerProfile;
    const fio = fioFromParts({ firstName: p?.firstName, lastName: p?.lastName, middleName: p?.middleName });
    return {
      id: u.id,
      label: fio || u.email,
      sub: [p?.organization, p?.city].filter(Boolean).join(" · ") || u.email,
    };
  });
}

/** Продукты, по которым есть лицензии, — варианты фильтра «Продукт». */
export async function loadLicenseProducts(dealerId?: string): Promise<string[]> {
  const rows = await db.license.findMany({
    where: { deletedAt: null, product: { not: null }, ...(dealerId ? { dealerId } : {}) },
    distinct: ["product"],
    select: { product: true },
    orderBy: { product: "asc" },
  });
  return rows.map((r) => r.product).filter((p): p is string => Boolean(p));
}
