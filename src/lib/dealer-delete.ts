import "server-only";

import { db } from "./db";
import { deleteObject } from "./s3";
import { refreshReceipt, syncAtolPayPayment } from "./payments/service";
import { formatRub } from "./money";
import { plural } from "./utils";

export type DealerFootprint = {
  licenses: number;
  payments: number;
  paidPayments: number;
  paidTotal: number;
  humaxPasswords: number;
  requests: number;
  logs: number;
  notifications: number;
  /** Записи старого ЛК: не удаляются, а становятся «без владельца». */
  legacyRecords: number;
  /** Что мешает обычному удалению (чек в кассе, возврат в процессе); снимается принудительным. */
  blockers: string[];
};

/**
 * Перед удалением узнаём у кассы судьбу чеков «в обработке»: обычно они давно
 * пробиты, просто колбэк не дошёл. Зависшие отправки без номера документа
 * при этом снимаются.
 */
export async function settleDealerReceipts(dealerId: string) {
  const waiting = await db.payment.findMany({
    where: { dealerId, OR: [{ receiptStatus: "wait" }, { refundReceiptStatus: "wait" }] },
    select: { id: true },
  });
  for (const p of waiting) {
    await refreshReceipt(p.id).catch((err) => console.error("[dealer-delete] не удалось обновить чек", p.id, err));
  }
}

function paymentLabel(p: { amount: unknown; license: { number: string } | null }) {
  return `${formatRub(Number(p.amount))}${p.license ? ` (${p.license.number})` : ""}`;
}

function adminLogWhere(dealerId: string, paymentIds: string[]) {
  return {
    OR: [
      { actorId: dealerId },
      { entity: "DEALER" as const, entityId: dealerId },
      ...(paymentIds.length ? [{ entity: "PAYMENT" as const, entityId: { in: paymentIds } }] : []),
    ],
  };
}

export async function dealerFootprint(dealerId: string): Promise<DealerFootprint> {
  const payments = await db.payment.findMany({
    where: { dealerId },
    select: {
      id: true,
      status: true,
      amount: true,
      refundStatus: true,
      receiptStatus: true,
      refundReceiptStatus: true,
      license: { select: { number: true } },
    },
  });
  const paymentIds = payments.map((p) => p.id);
  const [licenses, humaxPasswords, requests, licenseLogs, adminLogs, notifications, legacyRecords] = await Promise.all([
    db.license.count({ where: { dealerId } }),
    db.humaxPassword.count({ where: { dealerId } }),
    db.cancellationRequest.count({ where: { OR: [{ requestedById: dealerId }, { license: { dealerId } }] } }),
    db.licenseAuditLog.count({ where: { OR: [{ actorId: dealerId }, { license: { dealerId } }] } }),
    db.adminAuditLog.count({ where: adminLogWhere(dealerId, paymentIds) }),
    db.notificationLog.count({ where: { userId: dealerId } }),
    db.legacyRecord.count({ where: { userId: dealerId } }),
  ]);
  const paid = payments.filter((p) => p.status === "PAID" || p.status === "REFUNDED");
  const blockers: string[] = [];
  for (const p of payments) {
    if (p.refundStatus === "processing") {
      blockers.push(`по платежу на ${paymentLabel(p)} идёт возврат средств`);
    }
    if (p.receiptStatus === "wait" || p.refundReceiptStatus === "wait") {
      blockers.push(
        `касса АТОЛ ещё не подтвердила ${p.refundReceiptStatus === "wait" ? "чек возврата" : "чек"} по платежу на ${paymentLabel(p)}`,
      );
    }
  }
  return {
    licenses,
    payments: payments.length,
    paidPayments: paid.length,
    paidTotal: paid.reduce((sum, p) => sum + Number(p.amount), 0),
    humaxPasswords,
    requests,
    logs: licenseLogs + adminLogs,
    notifications,
    legacyRecords,
    blockers,
  };
}

/** «3 лицензии, 2 платежа на 10 000 ₽, …» — для подтверждения и журнала. */
export function describeFootprint(f: DealerFootprint): string[] {
  return [
    f.licenses > 0 && `${f.licenses} ${plural(f.licenses, ["лицензия", "лицензии", "лицензий"])}`,
    f.payments > 0 &&
      `${f.payments} ${plural(f.payments, ["платёж", "платежа", "платежей"])}` +
        (f.paidPayments > 0 ? ` (оплачено ${f.paidPayments} на ${formatRub(f.paidTotal)})` : ""),
    f.humaxPasswords > 0 &&
      `${f.humaxPasswords} ${plural(f.humaxPasswords, ["пароль HUMAX", "пароля HUMAX", "паролей HUMAX"])}`,
    f.requests > 0 && `${f.requests} ${plural(f.requests, ["заявка", "заявки", "заявок"])} на аннулирование и возврат`,
    f.logs > 0 && `${f.logs} ${plural(f.logs, ["запись", "записи", "записей"])} в журналах`,
    f.notifications > 0 &&
      `${f.notifications} ${plural(f.notifications, ["отправленное уведомление", "отправленных уведомления", "отправленных уведомлений"])}`,
  ].filter((x): x is string => Boolean(x));
}

/**
 * Удаляет дилера вместе со всем, что на нём числится: лицензиями, платежами,
 * паролями HUMAX, заявками и записями журналов. Записи старого ЛК DriveMods
 * остаются, но теряют владельца. Неоплаченные счета АТОЛ Pay сначала
 * сверяются с эквайрингом: пришедшие деньги без записи потерялись бы.
 *
 * forced — удалить, даже если сверка не удалась или деньги пришли: сверка
 * всё равно запускается, чтобы по пришедшей оплате ушёл чек. Возвращает, что
 * при этом пришлось проигнорировать, — для журнала.
 */
export async function deleteDealerCompletely(dealerId: string, { forced = false } = {}): Promise<string[]> {
  const ignored: string[] = [];
  const openOnline = await db.payment.findMany({
    where: { dealerId, provider: "atol_pay", status: { in: ["PENDING", "FAILED"] } },
    select: { id: true, amount: true },
  });
  for (const p of openOnline) {
    const amount = formatRub(Number(p.amount));
    let synced;
    try {
      synced = await syncAtolPayPayment(p.id);
    } catch (e) {
      const message = `не удалось сверить счёт на ${amount} с АТОЛ Pay: ${(e as Error).message}`;
      if (!forced) throw new Error(message[0].toUpperCase() + message.slice(1));
      ignored.push(message);
      continue;
    }
    if (synced?.paid || synced?.amountMismatch) {
      if (!forced) {
        throw new Error(`По счёту на ${amount} пришла оплата в АТОЛ Pay — сначала разберитесь с ней в «Платежах»`);
      }
      ignored.push(`по счёту на ${amount} пришла оплата в АТОЛ Pay`);
    }
  }

  const [licenses, profile] = await Promise.all([
    db.license.findMany({ where: { dealerId }, select: { licenseKey: true, deviceIdKey: true } }),
    db.dealerProfile.findUnique({ where: { userId: dealerId }, select: { avatarKey: true } }),
  ]);
  const files = [
    ...licenses.flatMap((l) => [l.licenseKey, l.deviceIdKey]),
    profile?.avatarKey ?? null,
  ].filter((k): k is string => Boolean(k));

  await db.$transaction(
    async (tx) => {
      const paymentIds = (await tx.payment.findMany({ where: { dealerId }, select: { id: true } })).map((p) => p.id);
      await tx.adminAuditLog.deleteMany({ where: adminLogWhere(dealerId, paymentIds) });
      await tx.licenseAuditLog.deleteMany({ where: { actorId: dealerId } });
      await tx.cancellationRequest.deleteMany({ where: { requestedById: dealerId } });
      await tx.payment.deleteMany({ where: { dealerId } });
      // История и заявки по самим лицензиям удаляются каскадом.
      await tx.license.deleteMany({ where: { dealerId } });
      await tx.humaxPassword.deleteMany({ where: { dealerId } });
      await tx.notificationLog.deleteMany({ where: { userId: dealerId } });
      await tx.user.delete({ where: { id: dealerId } });
    },
    { timeout: 60_000 },
  );

  // Файлы в хранилище — после фиксации: недоудалённый файл лишь занимает место.
  void (async () => {
    for (const key of files) {
      await deleteObject(key).catch((err) => console.error("[dealer-delete] не удалось удалить файл", key, err));
    }
  })();
  return ignored;
}
