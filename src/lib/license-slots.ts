import "server-only";

import type { PaymentStatus } from "@prisma/client";
import { db } from "./db";

/** Счёт ещё ждёт денег. Оплаченный, отменённый и возвращённый слот не держат. */
const UNPAID: PaymentStatus[] = ["PENDING", "FAILED"];

/**
 * Пересчитывает licensesUsed по фактическим лицензиям представителя.
 *
 * Лимит — это сколько лицензий дилер может держать неоплаченными: слот
 * занимает только лицензия с неоплаченным счётом. Оплатил — слот свободен;
 * бесплатные (повторная генерация, выдача без оплаты) слот не занимают вовсе.
 *
 * Аннулированная и удалённая лицензия слот освобождает.
 *
 * Именно пересчёт, а не «минус один»: аннулирование и удаление могут прийти
 * к одной лицензии подряд, и на инкрементах счётчик уехал бы в минус.
 */
export async function syncLicenseSlots(dealerId: string): Promise<void> {
  try {
    const used = await db.license.count({
      where: {
        dealerId,
        deletedAt: null,
        status: "ACTIVE",
        payment: { is: { status: { in: UNPAID } } },
      },
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
