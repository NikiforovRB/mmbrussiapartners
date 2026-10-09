import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import {
  fiscalizePayment,
  fiscalizeRefund,
  markPaymentPaidManually,
  refreshReceipt,
  refundPayment,
  syncAtolPayPayment,
} from "@/lib/payments/service";
import { recordAdminAction } from "@/lib/admin-audit";
import { notifyUser, notifyAdmins } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";
import { formatRub } from "@/lib/money";
import { requirePermission } from "@/lib/session";
import { fioFromParts } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["confirm", "cancel", "fiscalize", "refresh-receipt", "refund"]),
  /** Для refund: деньги администратор вернул сам, эквайринг не трогаем. */
  manual: z.boolean().optional(),
  /** Для confirm: оплаченная сумма, по умолчанию — сумма счёта. Может быть 0. */
  amount: z.number().min(0, "Сумма не может быть отрицательной").max(100_000_000).optional(),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("payments.manage");

  const { id } = await ctx.params;
  const { action, manual, amount } = await parseBody(req, schema);

  const payment = await db.payment.findUnique({
    where: { id },
    include: { license: { select: { number: true } } },
  });
  if (!payment) throw notFound("Платёж не найден");

  const licenseLabel = payment.license?.number ? `Лицензия ${payment.license.number}` : "Счёт";
  const amountLabel = formatRub(payment.amount);

  try {
    switch (action) {
      case "confirm": {
        const updated = await markPaymentPaidManually(id, { actorId: session.user.id, amount });
        const paidLabel = formatRub(updated.amount);
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: "CONFIRMED",
          summary: `${licenseLabel} · ${paidLabel}${paidLabel !== amountLabel ? ` (счёт ${amountLabel})` : ""} · без чека`,
        });
        if (payment.licenseId) {
          await db.licenseAuditLog.create({
            data: {
              licenseId: payment.licenseId,
              actorId: session.user.id,
              action: "EDITED",
              reason: `Отмечена оплаченной: ${paidLabel}, без чека`,
            },
          });
        }
        await notifyUser(payment.dealerId, {
          type: "PAYMENT_PAID",
          title: `Оплата подтверждена: ${paidLabel}`,
          body: licenseLabel,
          link: `/dealer/payments/${id}`,
        });
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "cancel": {
        if (payment.status === "PAID") throw badRequest("Оплаченный платёж нельзя отменить");
        const updated = await db.payment.update({ where: { id }, data: { status: "CANCELLED" } });
        await syncLicenseSlots(payment.dealerId);
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: "CANCELLED",
          summary: `${licenseLabel} · ${amountLabel}`,
        });
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "fiscalize": {
        const refund = payment.status === "REFUNDED";
        const updated = refund ? await fiscalizeRefund(id) : await fiscalizePayment(id);
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: refund ? "REFUND_FISCALIZED" : "FISCALIZED",
          summary: `${licenseLabel} · ${(refund ? updated.refundReceiptStatus : updated.receiptStatus) ?? "—"}`,
        });
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "refresh-receipt": {
        const updated = await refreshReceipt(id);
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "refund": {
        if (!hasPermission(session.user.permissions, "payments.refund", session.user.isSuperAdmin)) {
          throw forbidden("Нет права оформлять возвраты");
        }
        if (payment.status !== "PAID") {
          throw badRequest("Вернуть можно только оплаченный платёж");
        }
        const updated = await refundPayment(id, { manual, actorId: session.user.id });
        const viaAtolPay = updated.refundMethod === "atol_pay";
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: "REFUNDED",
          summary: `${licenseLabel} · ${amountLabel} · ${viaAtolPay ? "через АТОЛ Pay" : "вручную"}`,
        });
        const licenseNote = payment.license
          ? ` Лицензия ${payment.license.number} аннулирована и больше не действует.`
          : "";
        await notifyUser(payment.dealerId, {
          type: "PAYMENT_REFUNDED",
          title: `Возврат средств: ${amountLabel}`,
          body:
            (viaAtolPay
              ? "Деньги возвращены туда, откуда вы платили; банк зачислит их обычно за 1–10 рабочих дней."
              : "Администратор оформил возврат средств.") + licenseNote,
          link: payment.licenseId ? `/dealer/licenses/${payment.licenseId}` : `/dealer/payments/${id}`,
        });
        const dealer = await db.user.findUnique({
          where: { id: payment.dealerId },
          select: {
            email: true,
            dealerProfile: { select: { firstName: true, lastName: true, middleName: true, city: true } },
          },
        });
        const dealerName =
          fioFromParts({
            firstName: dealer?.dealerProfile?.firstName,
            lastName: dealer?.dealerProfile?.lastName,
            middleName: dealer?.dealerProfile?.middleName,
          }) || dealer?.email || "дилер";
        await notifyAdmins(["payments.manage"], {
          type: "PAYMENT_REFUNDED",
          title: `Возврат ${amountLabel}: ${dealerName}`,
          body: [
            payment.license ? `Лицензия ${payment.license.number} аннулирована` : "Счёт без лицензии",
            dealer?.dealerProfile?.city ?? null,
            dealer?.email ?? null,
            viaAtolPay ? "через АТОЛ Pay" : "вручную",
          ]
            .filter(Boolean)
            .join(" · "),
          link: payment.licenseId ? `/admin/licenses/${payment.licenseId}` : "/admin/payments",
        });
        if (updated.refundReceiptStatus === "fail") {
          await notifyAdmins(["payments.manage"], {
            type: "RECEIPT_FAILED",
            title: `Чек возврата не пробит: ${amountLabel}`,
            body: updated.refundReceiptError ?? licenseLabel,
            link: "/admin/payments",
          });
        }
        return NextResponse.json({ ok: true, payment: updated });
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw badRequest((e as Error).message);
  }
});

/**
 * Удаление записи о платеже. Неоплаченный счёт АТОЛ Pay перед удалением
 * сверяется с эквайрингом: если деньги уже пришли, запись нужна для чека и
 * возврата, и удалять её нельзя.
 */
export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("payments.delete");
  const { id } = await ctx.params;

  const payment = await db.payment.findUnique({
    where: { id },
    select: {
      id: true,
      dealerId: true,
      status: true,
      provider: true,
      externalId: true,
      amount: true,
      description: true,
      receiptStatus: true,
      refundStatus: true,
      refundReceiptStatus: true,
      license: { select: { number: true } },
      dealer: { select: { email: true } },
    },
  });
  if (!payment) throw notFound("Платёж не найден");
  if (payment.refundStatus === "processing") {
    throw badRequest("По платежу идёт возврат средств — дождитесь, пока он завершится");
  }
  if (payment.receiptStatus === "wait" || payment.refundReceiptStatus === "wait") {
    throw badRequest("Касса ещё пробивает чек по этому платежу — обновите статус чека и повторите");
  }

  if (payment.provider === "atol_pay" && payment.status !== "PAID" && payment.status !== "REFUNDED") {
    let synced;
    try {
      synced = await syncAtolPayPayment(id);
    } catch (e) {
      throw badRequest(`Не удалось сверить оплату с АТОЛ Pay: ${(e as Error).message}. Повторите позже.`);
    }
    if (synced?.paid || synced?.amountMismatch) {
      throw badRequest("По счёту уже поступила оплата в АТОЛ Pay — удалять его нельзя");
    }
  }

  await db.payment.delete({ where: { id } });
  await syncLicenseSlots(payment.dealerId);

  const statusLabel: Record<string, string> = {
    PENDING: "ожидал оплаты",
    PAID: "оплачен",
    FAILED: "ошибка оплаты",
    CANCELLED: "отменён",
    REFUNDED: "возвращён",
  };
  await recordAdminAction({
    actorId: session.user.id,
    entity: "PAYMENT",
    entityId: id,
    action: "PAYMENT_DELETED",
    summary: [
      payment.license?.number ? `Лицензия ${payment.license.number}` : (payment.description ?? "Счёт"),
      formatRub(payment.amount),
      statusLabel[payment.status] ?? payment.status,
      payment.dealer.email,
      ...(payment.provider === "atol_pay" ? [`заказ АТОЛ Pay ${payment.externalId ?? id}`] : []),
    ].join(" · "),
  });
  return NextResponse.json({ ok: true });
});
