import "server-only";

import type { LicenseStatus } from "@prisma/client";
import { db } from "./db";

/**
 * Статусы, при которых лицензия продолжает занимать слот лимита.
 * Аннулированная, отозванная и удалённая слот освобождают, истёкшая — нет:
 * она была выдана и оплачена.
 */
const OCCUPYING: LicenseStatus[] = ["DRAFT", "ACTIVE", "EXPIRED"];

/**
 * Пересчитывает licensesUsed по фактическим лицензиям представителя.
 *
 * Именно пересчёт, а не «минус один»: аннулирование, отзыв и удаление могут
 * прийти к одной лицензии подряд, и на инкрементах счётчик уехал бы в минус.
 */
export async function syncLicenseSlots(dealerId: string): Promise<void> {
  try {
    const used = await db.license.count({
      where: { dealerId, deletedAt: null, status: { in: OCCUPYING } },
    });
    await db.dealerProfile.updateMany({
      where: { userId: dealerId },
      data: { licensesUsed: used },
    });
  } catch (err) {
    console.error("[limits] не удалось пересчитать использованные лицензии", err);
  }
}

/** Пересчёт сразу по нескольким представителям (массовые операции). */
export async function syncLicenseSlotsFor(dealerIds: string[]): Promise<void> {
  await Promise.all([...new Set(dealerIds)].map((id) => syncLicenseSlots(id)));
}
