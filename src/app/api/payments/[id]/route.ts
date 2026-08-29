import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ApiError, badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { fiscalizePayment, markPaymentPaid, refreshReceipt } from "@/lib/payments/service";
import { recordAdminAction } from "@/lib/admin-audit";
import { notifyUser, notifyAdmins } from "@/lib/app-notifications";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["confirm", "cancel", "fiscalize", "refresh-receipt"]),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "payments.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const { action } = await parseBody(req, schema);

  const payment = await db.payment.findUnique({
    where: { id },
    include: { license: { select: { number: true } } },
  });
  if (!payment) throw notFound("Платёж не найден");

  const licenseLabel = payment.license?.number ? `Лицензия ${payment.license.number}` : "Счёт";
  const amountLabel = `${Number(payment.amount).toLocaleString("ru-RU")} ₽`;

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
        const updated = await fiscalizePayment(id);
        await recordAdminAction({
          actorId: session.user.id,
          entity: "PAYMENT",
          entityId: id,
          action: "FISCALIZED",
          summary: `${licenseLabel} · ${updated.receiptStatus ?? "—"}`,
        });
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "refresh-receipt": {
        const updated = await refreshReceipt(id);
        return NextResponse.json({ ok: true, payment: updated });
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw badRequest((e as Error).message);
  }
});
