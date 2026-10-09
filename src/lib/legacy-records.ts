import "server-only";

import type { LegacyRecordKind, Prisma } from "@prisma/client";
import { db } from "./db";

export const LEGACY_RECORD_TABS = ["licenses", "payments", "other"] as const;
export type LegacyRecordTab = (typeof LEGACY_RECORD_TABS)[number];

export const TAB_KINDS: Record<LegacyRecordTab, LegacyRecordKind[]> = {
  licenses: ["LICENSE"],
  payments: ["PAYMENT"],
  other: ["PASSWORD", "SERVICE"],
};

export type LegacyRecordFilter = {
  tab: LegacyRecordTab;
  q?: string;
  /** assigned — есть владелец на портале, unassigned — нет, manual — назначены вручную. */
  owner?: "assigned" | "unassigned" | "manual";
  pay?: "paid" | "unpaid";
  /** Дилер старого ЛК (LegacyDealer.id) или none — без дилера. */
  dealer?: string;
  /** Дилер портала. */
  user?: string;
};

export function parseLegacyRecordFilter(sp: Record<string, string | undefined>, tab: LegacyRecordTab): LegacyRecordFilter {
  const owner = sp.owner === "assigned" || sp.owner === "unassigned" || sp.owner === "manual" ? sp.owner : undefined;
  const pay = sp.pay === "paid" || sp.pay === "unpaid" ? sp.pay : undefined;
  return {
    tab,
    q: sp.q?.trim().slice(0, 200) || undefined,
    owner,
    pay,
    dealer: sp.dealer?.trim().slice(0, 40) || undefined,
    user: sp.user?.trim().slice(0, 40) || undefined,
  };
}

export function legacyRecordWhere(f: LegacyRecordFilter): Prisma.LegacyRecordWhereInput {
  const where: Prisma.LegacyRecordWhereInput = { kind: { in: TAB_KINDS[f.tab] } };
  if (f.owner === "assigned") where.userId = { not: null };
  else if (f.owner === "unassigned") where.userId = null;
  else if (f.owner === "manual") where.manualAssign = true;
  if (f.user) where.userId = f.user;
  if (f.pay === "paid") where.paymentStatus = "PAID";
  else if (f.pay === "unpaid") where.paymentStatus = { not: "PAID" };
  if (f.dealer) where.legacyDealerId = f.dealer === "none" ? null : f.dealer;

  const words = (f.q ?? "").split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length) {
    where.AND = words.map((w) => {
      const text = { contains: w, mode: "insensitive" as const };
      return {
        OR: [
          { id: w },
          { dealerComment: text },
          { product: text },
          { bundle: text },
          { version: text },
          { versionCustom: text },
          { authorName: text },
          { legacyDealer: { name: text } },
          { legacyDealer: { city: text } },
          { user: { email: text } },
          { user: { dealerProfile: { lastName: text } } },
        ],
      };
    });
  }
  return where;
}

/**
 * Записи дилера старого ЛК переходят к дилеру, к которому его
 * привязали (или освобождаются при отвязке). Назначенные вручную не трогаем.
 */
export async function syncLegacyRecordOwners(
  legacyDealerId: string,
  userId: string | null,
  client: Prisma.TransactionClient = db,
): Promise<number> {
  const res = await client.legacyRecord.updateMany({
    where: { legacyDealerId, manualAssign: false },
    data: { userId },
  });
  return res.count;
}
