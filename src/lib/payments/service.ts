import "server-only";

import { db } from "@/lib/db";
import {
  AtolError,
  getReceiptReport,
  isAtolConfigured,
  normalizeReport,
  registerReceipt,
  type AtolReport,
} from "./atol";
import { getPaymentProvider } from "./provider";

/** Базовый адрес портала для return- и callback-ссылок. */
export function siteOrigin(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.PUBLIC_SITE_ORIGIN ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function absolute(url: string): string {
  return url.startsWith("http") ? url : `${siteOrigin()}${url}`;
}

export type CreatePaymentInput = {
  dealerId: string;
  amount: number;
  description: string;
  licenseId?: string | null;
  email?: string | null;
  phone?: string | null;
};

/**
 * Создаёт платёж и получает у эквайринга ссылку на оплату.
 */
export async function createPayment(input: CreatePaymentInput) {
  const provider = getPaymentProvider();

  const payment = await db.payment.create({
    data: {
      dealerId: input.dealerId,
      amount: input.amount,
      currency: "RUB",
      status: "PENDING",
      provider: provider.id,
      description: input.description,
      licenseId: input.licenseId ?? null,
    },
  });

  const checkout = await provider.createCheckout({
    paymentId: payment.id,
    amount: input.amount,
    description: input.description,
    email: input.email,
    phone: input.phone,
    returnUrl: absolute(`/dealer/payments/${payment.id}`),
  });

  return db.payment.update({
    where: { id: payment.id },
    data: { externalId: checkout.externalId, payUrl: checkout.payUrl },
  });
}

/**
 * Отмечает платёж оплаченным и сразу отправляет чек в кассу.
 * Ошибка фискализации не откатывает оплату: деньги получены,
 * чек можно пробить повторно из карточки платежа.
 */
export async function markPaymentPaid(paymentId: string, confirmedById?: string | null) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Платёж не найден");
  if (payment.status === "PAID") return payment;

  await db.payment.update({
    where: { id: paymentId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      confirmedById: confirmedById ?? null,
    },
  });

  return fiscalizePayment(paymentId);
}

/**
 * Регистрирует чек «Приход» в АТОЛ Онлайн.
 * Повторный вызов для уже пробитого чека ничего не делает.
 */
export async function fiscalizePayment(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { dealer: { include: { dealerProfile: true } } },
  });
  if (!payment) throw new Error("Платёж не найден");
  if (payment.status !== "PAID") throw new Error("Чек пробивается только по оплаченному платежу");
  if (payment.receiptStatus === "done") return payment;

  if (!isAtolConfigured()) {
    return db.payment.update({
      where: { id: paymentId },
      data: {
        receiptStatus: "fail",
        receiptError: "Касса АТОЛ Онлайн не настроена (ATOL_LOGIN / ATOL_PASSWORD / ATOL_GROUP).",
      },
    });
  }

  const amount = Number(payment.amount);
  const name = payment.description ?? "Лицензия MMB RUSSIA";

  try {
    const { uuid } = await registerReceipt({
      // external_id должен быть уникален в пределах группы ККТ:
      // при повторной попытке нужен новый идентификатор.
      externalId: `${payment.id}-${Date.now().toString(36)}`,
      items: [{ name, price: amount, quantity: 1, sum: amount }],
      total: amount,
      customerEmail: payment.dealer.email,
      customerPhone: payment.dealer.dealerProfile?.phone ?? null,
      callbackUrl: `${siteOrigin()}/api/atol/webhook`,
    });

    return await db.payment.update({
      where: { id: paymentId },
      data: { receiptUuid: uuid, receiptStatus: "wait", receiptError: null },
    });
  } catch (e) {
    const message = e instanceof AtolError ? e.message : (e as Error).message;
    return db.payment.update({
      where: { id: paymentId },
      data: { receiptStatus: "fail", receiptError: message },
    });
  }
}

/** Записывает результат обработки чека (из колбэка или из report()). */
export async function applyReceiptReport(paymentId: string, report: AtolReport) {
  const current = await db.payment.findUnique({
    where: { id: paymentId },
    select: { providerPayload: true },
  });
  const existing =
    current?.providerPayload && typeof current.providerPayload === "object"
      ? (current.providerPayload as Record<string, unknown>)
      : {};

  return db.payment.update({
    where: { id: paymentId },
    data: {
      receiptStatus: report.status,
      receiptUrl: report.ofdReceiptUrl,
      fiscalDocNumber: report.fiscalDocumentNumber,
      receiptError: report.errorText,
      providerPayload: { ...existing, atolReceipt: report.raw } as never,
    },
  });
}

/** Опрашивает АТОЛ о судьбе чека — на случай, если колбэк не дошёл. */
export async function refreshReceipt(paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.receiptUuid) throw new Error("Чек по этому платежу ещё не отправлялся");
  const report = await getReceiptReport(payment.receiptUuid);
  return applyReceiptReport(paymentId, report);
}

/** Обработка POST-колбэка от АТОЛ Онлайн после фискализации. */
export async function handleAtolCallback(payload: Record<string, unknown>) {
  const report = normalizeReport(payload);
  if (!report.uuid) return null;
  const payment = await db.payment.findFirst({ where: { receiptUuid: report.uuid } });
  if (!payment) return null;
  return applyReceiptReport(payment.id, report);
}
