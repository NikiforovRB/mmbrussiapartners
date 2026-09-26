import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import {
  fiscalizePayment,
  fiscalizeRefund,
  markPaymentPaid,
  refreshReceipt,
  refundPayment,
  syncAtolPayPayment,
} from "@/lib/payments/service";
import { recordAdminAction } from "@/lib/admin-audit";
import { notifyUser, notifyAdmins } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";
import { formatRub } from "@/lib/money";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["confirm", "cancel", "fiscalize", "refresh-receipt", "refund", "sync"]),
  /** Для refund: деньги администратор вернул сам, эквайринг не трогаем. */
  manual: z.boolean().optional(),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("payments.manage");

  const { id } = await ctx.params;
  const { action, manual } = await parseBody(req, schema);

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
        const updated = await markPaymentPaid(id, session.user.id);
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: "CONFIRMED",
          summary: `${licenseLabel} · ${amountLabel}`,
        });
        await notifyUser(payment.dealerId, {
          type: "PAYMENT_PAID",
          title: `Оплата подтверждена: ${amountLabel}`,
          body: licenseLabel,
          link: `/dealer/payments/${id}`,
        });
        if (updated.receiptStatus === "fail") {
          await notifyAdmins(["payments.manage"], {
            type: "RECEIPT_FAILED",
            title: `Чек не пробит: ${amountLabel}`,
            body: updated.receiptError ?? licenseLabel,
            link: "/admin/payments",
          });
        }
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
      case "sync": {
        if (payment.provider !== "atol_pay") throw badRequest("Счёт выставлен не через АТОЛ Pay");
        const synced = await syncAtolPayPayment(id);
        return NextResponse.json({
          ok: true,
          paid: synced?.paid ?? false,
          statusMessage: synced?.current?.message ?? null,
        });
      }
      case "refund": {
        if (!hasPermission(session.user.permissions, "payments.refund", session.user.isSuperAdmin)) {
          throw forbidden("Нет права оформлять возвраты");
        }
        if (payment.status !== "PAID") {
          throw badRequest("Вернуть можно только оплаченный платёж");
        }
        const updated = await refundPayment(id, { manual });
        const viaAtolPay = updated.refundMethod === "atol_pay";
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: "REFUNDED",
          summary: `${licenseLabel} · ${amountLabel} · ${viaAtolPay ? "через АТОЛ Pay" : "вручную"}`,
        });
        await notifyUser(payment.dealerId, {
          type: "PAYMENT_PAID",
          title: `Возврат средств: ${amountLabel}`,
          body: viaAtolPay ? `${licenseLabel}. Деньги вернутся туда, откуда была оплата.` : licenseLabel,
          link: `/dealer/payments/${id}`,
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
