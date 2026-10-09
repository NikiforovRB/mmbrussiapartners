import "server-only";

import { db } from "./db";
import { createPayment, markPaymentPaidManually } from "./payments/service";
import { syncLicenseSlots } from "./license-slots";
import { formatRub } from "./money";

export class LicensePriceError extends Error {}

export type LicensePriceChange = {
  before: number | null;
  after: number;
  /** Что стало со счётом по лицензии. */
  payment: "updated" | "cancelled" | "created" | "none";
};

const OPEN_STATUSES = ["PENDING", "FAILED", "CANCELLED"] as const;

/** Поля счёта, которые показывает карточка лицензии. */
export const LICENSE_PAYMENT_SELECT = {
  id: true,
  status: true,
  amount: true,
  provider: true,
  paidAt: true,
  refundedAt: true,
  refundMethod: true,
  paidManually: true,
} as const;

/**
 * Меняет стоимость уже выданной лицензии. Неоплаченный счёт следует за ценой:
 * сумма меняется, а ссылка на оплату перевыпускается — заказ АТОЛ Pay
 * одноразовый и зарегистрирован на прежнюю сумму. При 0 ₽ счёт отменяется.
 * Оплаченный счёт не трогаем: деньги уже получены, их возвращают возвратом.
 */
export async function changeLicensePrice(
  licenseId: string,
  rawPrice: number,
): Promise<LicensePriceChange> {
  const price = Math.round(rawPrice * 100) / 100;
  if (!Number.isFinite(price) || price < 0) throw new LicensePriceError("Некорректная стоимость");

  const license = await db.license.findUnique({
    where: { id: licenseId },
    include: {
      payment: true,
      dealer: { select: { email: true, dealerProfile: { select: { phone: true } } } },
    },
  });
  if (!license) throw new LicensePriceError("Лицензия не найдена");

  const before = license.price === null ? null : Number(license.price);
  const payment = license.payment;
  if (payment && (payment.status === "PAID" || payment.status === "REFUNDED")) {
    throw new LicensePriceError(
      payment.status === "PAID"
        ? "Счёт по лицензии уже оплачен — его сумму изменить нельзя. Чтобы вернуть деньги, оформите возврат в разделе «Платежи»."
        : "По лицензии уже оформлен возврат — стоимость изменить нельзя.",
    );
  }
  if (license.status === "CANCELLED" && price > 0) {
    throw new LicensePriceError("Лицензия аннулирована — выставлять по ней счёт нельзя.");
  }

  let result: LicensePriceChange["payment"] = "none";
  if (payment) {
    const claimed = await db.payment.updateMany({
      where: { id: payment.id, status: { in: [...OPEN_STATUSES] } },
      data:
        price === 0
          ? { status: "CANCELLED" }
          : {
              amount: price,
              status: "PENDING",
              payUrl: payment.provider === "atol_pay" ? `/dealer/payments/${payment.id}` : payment.payUrl,
            },
    });
    if (claimed.count === 0) {
      throw new LicensePriceError("Счёт только что оплачен — обновите страницу.");
    }
    result = price === 0 ? (payment.status === "CANCELLED" ? "none" : "cancelled") : "updated";
  } else if (price > 0) {
    await createPayment({
      dealerId: license.dealerId,
      licenseId: license.id,
      amount: price,
      description: `Лицензия ${license.number}${license.product ? ` · ${license.product}` : ""}`,
      email: license.dealer.email,
      phone: license.dealer.dealerProfile?.phone,
    });
    result = "created";
  }

  await db.license.update({ where: { id: license.id }, data: { price } });
  await syncLicenseSlots(license.dealerId);
  return { before, after: price, payment: result };
}

export type LicensePaidMark = {
  number: string;
  dealerId: string;
  amount: number;
  /** false — лицензия уже была оплачена на эту сумму. */
  changed: boolean;
};

/**
 * Отмечает лицензию оплаченной по решению администратора — на любую сумму,
 * в том числе 0. Без суммы берётся сумма счёта, иначе цена лицензии. Счёт,
 * если его не было, создаётся сразу оплаченным. Чек не пробивается.
 */
export async function markLicensePaid(
  licenseId: string,
  opts: { actorId: string; amount?: number | null },
): Promise<LicensePaidMark> {
  const license = await db.license.findUnique({
    where: { id: licenseId },
    select: {
      id: true,
      number: true,
      dealerId: true,
      product: true,
      price: true,
      deletedAt: true,
      payment: { select: { id: true, status: true, amount: true } },
    },
  });
  if (!license || license.deletedAt) throw new LicensePriceError("Лицензия не найдена");

  const payment = license.payment;
  const fallback = payment ? Number(payment.amount) : license.price === null ? 0 : Number(license.price);
  const amount = Math.round((opts.amount ?? fallback) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) throw new LicensePriceError("Некорректная сумма оплаты");

  const base = { number: license.number, dealerId: license.dealerId, amount };
  if (payment?.status === "REFUNDED") {
    throw new LicensePriceError(`По лицензии ${license.number} уже оформлен возврат`);
  }
  if (payment?.status === "PAID" && Math.abs(Number(payment.amount) - amount) < 0.005) {
    return { ...base, changed: false };
  }

  if (payment) {
    try {
      await markPaymentPaidManually(payment.id, { actorId: opts.actorId, amount });
    } catch (e) {
      throw new LicensePriceError(`Лицензия ${license.number}: ${(e as Error).message}`);
    }
  } else {
    await db.payment.create({
      data: {
        dealerId: license.dealerId,
        licenseId: license.id,
        amount,
        currency: "RUB",
        status: "PAID",
        provider: "manual",
        description: `Лицензия ${license.number}${license.product ? ` · ${license.product}` : ""}`,
        paidAt: new Date(),
        confirmedById: opts.actorId,
        paidManually: true,
      },
    });
    await syncLicenseSlots(license.dealerId);
  }

  await db.licenseAuditLog.create({
    data: {
      licenseId: license.id,
      actorId: opts.actorId,
      action: "EDITED",
      reason: `Отмечена оплаченной: ${formatRub(amount)}, без чека`,
      diff: {
        before: { payment: payment ? `${payment.status} ${Number(payment.amount)}` : null },
        after: { payment: `PAID ${amount}` },
      },
    },
  });
  return { ...base, changed: true };
}
