import "server-only";

import { db } from "@/lib/db";
import { mergePaymentSettings, type PaymentSettings } from "@/lib/site-settings";
import { notifyDealerReceipt } from "@/lib/notifications";
import { notifyAdmins, notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";
import { formatRub } from "@/lib/money";
import {
  AtolError,
  getReceiptReport,
  isAtolConfigured,
  normalizeReport,
  registerReceipt,
  type AtolReport,
} from "./atol";
import {
  ATOL_PAY_STATUS,
  getAtolPayOrderStatus,
  getPaymentProvider,
  type AtolPayOrderStatus,
  type CheckoutResult,
} from "./provider";

/** Настройки онлайн-оплаты из админки (наименование услуги, НДС, способ расчёта). */
async function loadPaymentSettings(): Promise<PaymentSettings> {
  const settings = await db.companySettings.findUnique({
    where: { id: "singleton" },
    select: { payment: true },
  });
  return mergePaymentSettings(settings?.payment);
}

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
  /** Email получателя чека (тег 1008). По умолчанию — почта представителя. */
  receiptEmail?: string | null;
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
      receiptEmail: input.receiptEmail ?? input.email ?? null,
      licenseId: input.licenseId ?? null,
    },
  });

  let checkout: CheckoutResult;
  try {
    checkout = await provider.createCheckout({
      paymentId: payment.id,
      amount: input.amount,
      description: input.description,
      email: input.email,
      phone: input.phone,
      returnUrl: absolute(`/dealer/payments/${payment.id}`),
      notifyUrl: atolPayCallbackUrl(payment.id),
    });
  } catch (err) {
    if (provider.id === "manual") throw err;
    // Эквайринг не выдал ссылку — счёт не теряем, а переводим на оплату по
    // реквизитам: её подтвердит администратор.
    const message = (err as Error).message;
    console.error(`[payments] ${provider.title}: не удалось создать ссылку на оплату ${payment.id}`, err);
    await notifyAdmins(["payments.manage"], {
      type: "PAYMENT_CREATED",
      title: "Онлайн-оплата недоступна",
      body: `Счёт выставлен на оплату по реквизитам. ${provider.title}: ${message}`,
      link: "/admin/payments",
    });
    return db.payment.update({
      where: { id: payment.id },
      data: {
        provider: "manual",
        externalId: `inv_${payment.id}`,
        payUrl: `/dealer/payments/${payment.id}`,
        providerPayload: { checkoutError: message } as never,
      },
    });
  }

  return db.payment.update({
    where: { id: payment.id },
    data: {
      externalId: checkout.externalId,
      payUrl: checkout.payUrl,
      ...(provider.id === "atol_pay"
        ? {
            providerPayload: {
              atolPayOrders: [checkout.externalId],
              atolPayAmounts: withOrderAmount({}, checkout),
            } as never,
          }
        : {}),
    },
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

  // Условный апдейт вместо «прочитали — записали»: из двух одновременных
  // подтверждений оплату проведёт только одно, второе получит count = 0
  // и не уйдёт пробивать второй чек по тем же деньгам.
  const claimed = await db.payment.updateMany({
    where: { id: paymentId, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date(), confirmedById: confirmedById ?? null },
  });
  if (claimed.count === 0) {
    return (await db.payment.findUnique({ where: { id: paymentId } })) ?? payment;
  }
  await syncLicenseSlots(payment.dealerId);

  return fiscalizePayment(paymentId);
}

/**
 * Регистрирует чек «Приход» в АТОЛ Онлайн.
 *
 * Пробитый чек повторно не отправляется, как и чек, который уже ушёл в кассу
 * и ждёт ответа: обновить его статус можно через refreshReceipt.
 */
export async function fiscalizePayment(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { dealer: { include: { dealerProfile: true } } },
  });
  if (!payment) throw new Error("Платёж не найден");
  if (payment.status !== "PAID") throw new Error("Чек пробивается только по оплаченному платежу");
  if (payment.receiptStatus === "done" || payment.receiptStatus === "wait") return payment;

  if (!isAtolConfigured()) {
    return db.payment.update({
      where: { id: paymentId },
      data: {
        receiptStatus: "fail",
        receiptError: "Касса АТОЛ Онлайн не настроена (ATOL_LOGIN / ATOL_PASSWORD / ATOL_GROUP).",
      },
    });
  }

  // Занимаем попытку до похода в кассу: параллельный вызов увидит "wait"
  // и выйдет, не отправив второй документ.
  const claimed = await db.payment.updateMany({
    where: {
      id: paymentId,
      status: "PAID",
      OR: [{ receiptStatus: null }, { receiptStatus: { notIn: ["done", "wait"] } }],
    },
    data: { receiptStatus: "wait", receiptAttempt: { increment: 1 }, receiptError: null },
  });
  if (claimed.count === 0) return payment;

  const attempt = (
    await db.payment.findUnique({ where: { id: paymentId }, select: { receiptAttempt: true } })
  )?.receiptAttempt ?? payment.receiptAttempt + 1;

  const settings = await loadPaymentSettings();
  const amount = Number(payment.amount);
  // Наименование позиции чека (тег 1030) — из настроек оплаты, а не из
  // служебного описания счёта (номер лицензии оставляем для внутреннего учёта).
  const name = settings.serviceLabel;
  // Чек уходит на явно указанный при выставлении счёта email, иначе — на
  // почту представителя.
  const receiptEmail = payment.receiptEmail || payment.dealer.email;

  try {
    const { uuid } = await registerReceipt({
      // Идентификатор документа стабилен в пределах попытки: повтор той же
      // попытки АТОЛ распознает как дубль и вернёт исходный uuid. Новый
      // номер появляется только после отказа кассы.
      externalId: `${payment.id}-${attempt}`,
      items: [{ name, price: amount, quantity: 1, sum: amount }],
      total: amount,
      customerEmail: receiptEmail,
      customerPhone: payment.dealer.dealerProfile?.phone ?? null,
      vatType: settings.vatType,
      paymentMethod: settings.paymentMethod,
      callbackUrl: atolCallbackUrl(),
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

/**
 * Колбэк АТОЛ приходит без подписи, поэтому подлинность подтверждает
 * неугадываемый токен в самом адресе. Без ATOL_WEBHOOK_SECRET колбэк
 * не запрашиваем вовсе — статус чека дотянет refreshReceipt.
 */
export function atolWebhookSecret(): string {
  return process.env.ATOL_WEBHOOK_SECRET ?? "";
}

/** Секрет для callback АТОЛ Pay (эквайринг). По умолчанию — общий с кассой. */
export function atolPayWebhookSecret(): string {
  return process.env.ATOL_PAY_WEBHOOK_SECRET ?? process.env.ATOL_WEBHOOK_SECRET ?? "";
}

/**
 * Адрес callback АТОЛ Pay о смене статуса оплаты (null — если секрет пуст).
 * id платежа передаём в адресе: формат тела колбэка АТОЛ Pay не документирован.
 */
export function atolPayCallbackUrl(paymentId: string): string | null {
  const secret = atolPayWebhookSecret();
  if (!secret) return null;
  const params = new URLSearchParams({ token: secret, orderId: paymentId });
  return `${siteOrigin()}/api/atolpay/webhook?${params}`;
}

function atolCallbackUrl(): string | null {
  const secret = atolWebhookSecret();
  if (!secret) return null;
  return `${siteOrigin()}/api/atol/webhook?token=${encodeURIComponent(secret)}`;
}

/** Записывает результат обработки чека (из колбэка или из report()). */
export async function applyReceiptReport(paymentId: string, report: AtolReport) {
  const current = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      providerPayload: true,
      receiptStatus: true,
      receiptEmail: true,
      amount: true,
      dealer: { select: { email: true } },
      license: { select: { number: true } },
    },
  });
  const existing =
    current?.providerPayload && typeof current.providerPayload === "object"
      ? (current.providerPayload as Record<string, unknown>)
      : {};

  const updated = await db.payment.update({
    where: { id: paymentId },
    data: {
      receiptStatus: report.status,
      receiptUrl: report.ofdReceiptUrl,
      fiscalDocNumber: report.fiscalDocumentNumber,
      receiptError: report.errorText,
      providerPayload: { ...existing, atolReceipt: report.raw } as never,
    },
  });

  // Чек только что пробит — отправляем ссылку на него дилеру письмом (в
  // дополнение к экземпляру, который ОФД шлёт на email из чека). Дубли не
  // рассылаем: письмо уходит только при переходе в статус "done".
  const becameDone = current?.receiptStatus !== "done" && report.status === "done";
  if (becameDone) {
    const to = current?.receiptEmail || current?.dealer?.email || null;
    if (to) {
      await notifyDealerReceipt({
        to,
        amount: Number(current?.amount ?? updated.amount),
        licenseNumber: current?.license?.number ?? null,
        receiptUrl: report.ofdReceiptUrl,
        fiscalDocNumber: report.fiscalDocumentNumber,
      }).catch((err) => console.error("[payments] не удалось отправить письмо с чеком", err));
    }
  }

  return updated;
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

function payloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Номера заказов АТОЛ Pay по платежу: текущий первым, затем перевыпущенные ранее. */
function atolPayOrders(payment: { id: string; externalId: string | null; providerPayload: unknown }) {
  const listed = payloadObject(payment.providerPayload).atolPayOrders;
  const previous = Array.isArray(listed) ? listed.filter((v): v is string => typeof v === "string") : [];
  const current = payment.externalId || payment.id;
  return [current, ...previous.filter((id) => id !== current)];
}

/** Суммы заказов АТОЛ Pay в копейках, как их подтвердил эквайринг при регистрации. */
function atolPayAmounts(payment: { providerPayload: unknown }): Record<string, number> {
  const raw = payloadObject(payloadObject(payment.providerPayload).atolPayAmounts);
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function withOrderAmount(amounts: Record<string, number>, checkout: CheckoutResult) {
  return checkout.amountMinor === undefined
    ? amounts
    : { ...amounts, [checkout.externalId]: checkout.amountMinor };
}

export type AtolPaySync = {
  paid: boolean;
  /** Статус текущего заказа у АТОЛ Pay; null — заказа нет или сверка не нужна. */
  current: AtolPayOrderStatus | null;
  /** Заказ оплачен, но на сумму, отличную от счёта: проводит только администратор. */
  amountMismatch?: boolean;
};

/**
 * Сверяет платёж с АТОЛ Pay и, если оплата подтверждена, проводит его и
 * пробивает чек. Источник истины — авторизованный запрос статуса заказа, а не
 * тело колбэка, поэтому подделанный колбэк ничего не проведёт.
 *
 * Сверяются и отменённые администратором счета: если деньги всё же пришли,
 * чек по 54-ФЗ обязателен.
 */
export async function syncAtolPayPayment(paymentId: string): Promise<AtolPaySync | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      provider: true,
      externalId: true,
      providerPayload: true,
      amount: true,
      dealerId: true,
      license: { select: { number: true } },
    },
  });
  if (!payment || payment.provider !== "atol_pay") return null;
  if (payment.status === "PAID" || payment.status === "REFUNDED") {
    return { paid: payment.status === "PAID", current: null };
  }

  let current: AtolPayOrderStatus | null = null;
  let paidOrder: string | null = null;
  for (const [index, orderId] of atolPayOrders(payment).entries()) {
    const status = await getAtolPayOrderStatus(orderId);
    if (index === 0) current = status;
    if (status?.code === ATOL_PAY_STATUS.success) {
      paidOrder = orderId;
      break;
    }
  }
  if (!paidOrder) return { paid: false, current };

  // Заказы до появления сверки сумм записаны без неё; сумма счёта после
  // создания не меняется, поэтому они зарегистрированы ровно на неё.
  const expectedMinor = Math.round(Number(payment.amount) * 100);
  const registeredMinor = atolPayAmounts(payment)[paidOrder];
  if (registeredMinor !== undefined && registeredMinor !== expectedMinor) {
    const payload = payloadObject(payment.providerPayload);
    if (payload.amountMismatchOrder !== paidOrder) {
      await db.payment.update({
        where: { id: payment.id },
        data: { providerPayload: { ...payload, amountMismatchOrder: paidOrder } as never },
      });
      console.error(
        `[payments] АТОЛ Pay: заказ ${paidOrder} оплачен на ${registeredMinor} коп., счёт ${payment.id} — на ${expectedMinor} коп.`,
      );
      await notifyAdmins(["payments.manage"], {
        type: "PAYMENT_PAID",
        title: "Оплата требует проверки: сумма не совпадает со счётом",
        body: `Заказ АТОЛ Pay ${paidOrder}: ${formatRub(registeredMinor / 100)} вместо ${formatRub(expectedMinor / 100)}`,
        link: "/admin/payments",
      });
    }
    return { paid: false, current, amountMismatch: true };
  }

  // Колбэк и возврат дилера на страницу счёта приходят почти одновременно:
  // провести оплату и разослать уведомления должен только один из них.
  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: { notIn: ["PAID", "REFUNDED"] } },
    data: { status: "PAID", paidAt: new Date(), confirmedById: null, externalId: paidOrder },
  });
  if (claimed.count === 0) return { paid: true, current };
  await syncLicenseSlots(payment.dealerId);

  const updated = await fiscalizePayment(payment.id);
  const amountLabel = formatRub(payment.amount);
  const licenseLabel = payment.license?.number ? `Лицензия ${payment.license.number}` : "Счёт";
  await notifyUser(payment.dealerId, {
    type: "PAYMENT_PAID",
    title: `Оплата получена: ${amountLabel}`,
    body: licenseLabel,
    link: `/dealer/payments/${payment.id}`,
  });
  await notifyAdmins(["payments.manage"], {
    type: "PAYMENT_PAID",
    title: `Онлайн-оплата: ${amountLabel}`,
    body: licenseLabel,
    link: "/admin/payments",
  });
  if (updated.receiptStatus === "fail") {
    await notifyAdmins(["payments.manage"], {
      type: "RECEIPT_FAILED",
      title: `Чек не пробит: ${amountLabel}`,
      body: updated.receiptError ?? licenseLabel,
      link: "/admin/payments",
    });
  }
  return { paid: true, current };
}

/**
 * Рабочая ссылка на оплату счёта АТОЛ Pay: текущая, пока заказ ждёт оплаты,
 * иначе — новая (ссылка просрочена, отменена или платёж не прошёл).
 * null — счёт уже оплачен, закрыт или онлайн-оплата выключена.
 */
export async function atolPayCheckoutUrl(paymentId: string): Promise<string | null> {
  const sync = await syncAtolPayPayment(paymentId);
  if (!sync || sync.paid || sync.amountMismatch) return null;

  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING") return null;

  const code = sync.current?.code;
  const awaitingPayment = code === ATOL_PAY_STATUS.processing || code === ATOL_PAY_STATUS.confirm3ds;
  if (awaitingPayment && payment.payUrl?.startsWith("http")) return payment.payUrl;

  const provider = getPaymentProvider();
  if (provider.id !== "atol_pay") return null;

  // У АТОЛ Pay номер заказа одноразовый, поэтому новая ссылка — новый заказ.
  const checkout = await provider.createCheckout({
    paymentId: payment.id,
    orderId: `${payment.id}-${Date.now().toString(36)}`,
    amount: Number(payment.amount),
    description: payment.description ?? "",
    returnUrl: absolute(`/dealer/payments/${payment.id}`),
    notifyUrl: atolPayCallbackUrl(payment.id),
  });
  await db.payment.update({
    where: { id: payment.id },
    data: {
      externalId: checkout.externalId,
      payUrl: checkout.payUrl,
      providerPayload: {
        ...payloadObject(payment.providerPayload),
        atolPayOrders: [checkout.externalId, ...atolPayOrders(payment)],
        atolPayAmounts: withOrderAmount(atolPayAmounts(payment), checkout),
      } as never,
    },
  });
  return checkout.payUrl;
}

/**
 * Обработка callback от АТОЛ Pay (эквайринг). Тело колбэка служит лишь
 * сигналом: оплату подтверждает сверка через API статуса заказа.
 */
export async function handleAtolPayCallback(
  payload: Record<string, unknown>,
  paymentIdFromUrl?: string | null,
) {
  const data = payloadObject(payload.data);
  const orderId = [paymentIdFromUrl, payload.orderId, data.orderId].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (!orderId) return null;

  const payment = await db.payment.findFirst({
    where: { OR: [{ id: orderId }, { externalId: orderId }] },
    select: { id: true },
  });
  if (!payment) return null;
  return syncAtolPayPayment(payment.id);
}
