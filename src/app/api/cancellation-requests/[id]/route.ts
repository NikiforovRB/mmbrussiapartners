import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { notifyAdmins, notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";
import { formatRub } from "@/lib/money";
import { refundPayment } from "@/lib/payments/service";
import { hasPermission } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional().nullable(),
  /** Для заявки на возврат: деньги администратор вернул сам, АТОЛ Pay не трогаем. */
  manualRefund: z.boolean().optional(),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("licenses.cancel");

  const { id } = await ctx.params;
  const { action, note, manualRefund } = await parseBody(req, schema);

  const request = await db.cancellationRequest.findUnique({
    where: { id },
    include: {
      license: {
        include: {
          dealer: true,
          payment: { select: { id: true, status: true, amount: true, provider: true, paidManually: true } },
        },
      },
    },
  });
  if (!request) throw notFound("Заявка не найдена");
  const { license } = request;
  const isRefund = request.kind === "REFUND";
  const payment = license.payment;
  const paid = payment?.status === "PAID";
  const approved = action === "approve";
  // Отклонённую заявку можно пересмотреть и одобрить, пока есть что аннулировать или возвращать.
  if (approved) {
    if (request.status === "APPROVED") throw badRequest("Заявка уже одобрена");
    if (request.status === "REJECTED" && license.status !== "ACTIVE" && !(isRefund && paid)) {
      throw badRequest(isRefund ? "Возвращать нечего: лицензия не активна и не оплачена" : "Лицензия уже не активна — аннулировать нечего");
    }
    if (isRefund && paid && !hasPermission(session.user.permissions, "payments.refund", session.user.isSuperAdmin)) {
      throw forbidden("Для возврата денег нужно право «Возвраты по платежам»");
    }
  } else if (request.status !== "PENDING") {
    throw badRequest("Заявка уже рассмотрена");
  }

  const review = {
    status: approved ? ("APPROVED" as const) : ("REJECTED" as const),
    reviewedById: session.user.id,
    reviewNote: note?.trim() || null,
    reviewedAt: new Date(),
  };
  const amountLabel = payment ? formatRub(Number(payment.amount)) : "";
  let outcome = "";

  if (approved && isRefund && paid) {
    // Деньги возвращаются тем же путём, что и в «Платежах»; лицензия аннулируется там же.
    let updated;
    try {
      updated = await refundPayment(payment.id, { manual: manualRefund === true, actorId: session.user.id });
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw badRequest((e as Error).message);
    }
    const viaAtolPay = updated.refundMethod === "atol_pay";
    await db.cancellationRequest.update({ where: { id }, data: review });
    await recordAdminAction({
      actorId: session.user.id,
      entity: "PAYMENT",
      entityId: payment.id,
      action: "REFUNDED",
      summary: `Лицензия ${license.number} · ${amountLabel} · по заявке дилера · ${viaAtolPay ? "через АТОЛ Pay" : "вручную"}`,
    });
    outcome = viaAtolPay
      ? `Деньги (${amountLabel}) возвращены туда, откуда вы платили; банк зачислит их обычно за 1–10 рабочих дней.`
      : `Возврат ${amountLabel} оформлен администратором.`;
    if (updated.refundReceiptStatus === "fail") {
      await notifyAdmins(["payments.manage"], {
        type: "RECEIPT_FAILED",
        title: `Чек возврата не пробит: ${amountLabel}`,
        body: updated.refundReceiptError ?? `Лицензия ${license.number}`,
        link: "/admin/payments",
      });
    }
  } else if (approved) {
    const reason = request.reason;
    await db.$transaction(async (tx) => {
      await tx.cancellationRequest.update({ where: { id }, data: review });
      // Неоплаченный счёт по аннулированной лицензии больше не нужен.
      if (payment && (payment.status === "PENDING" || payment.status === "FAILED")) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
      }
      if (license.status === "ACTIVE") {
        await tx.license.update({
          where: { id: license.id },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
        });
        await tx.licenseAuditLog.create({
          data: { licenseId: license.id, actorId: session.user.id, action: "CANCELLED", reason },
        });
      }
    });
    outcome =
      payment && payment.status !== "PAID" && payment.status !== "REFUNDED"
        ? "Лицензия аннулирована, счёт по ней отменён — оплачивать не нужно."
        : "Лицензия аннулирована.";
  } else {
    await db.cancellationRequest.update({ where: { id }, data: review });
  }

  if (approved) {
    await syncLicenseSlots(license.dealerId);
    await notifyAdmins(
      ["licenses.cancel"],
      {
        type: "LICENSE_CANCELLED",
        title: `${isRefund ? "Возврат по лицензии" : "Аннулирована лицензия"} ${license.number}`,
        body: `${license.dealer.email} · заявку одобрил ${session.user.email}: ${request.reason}`,
        link: `/admin/licenses/${license.id}`,
      },
      { exceptUserId: session.user.id },
    );
  }

  const what = isRefund ? "Заявка на возврат" : "Заявка на аннулирование";
  await notifyUser(request.requestedById, {
    type: "CANCELLATION_REVIEWED",
    title: `${what} по лицензии ${license.number} ${approved ? "одобрена" : "отклонена"}`,
    body: [outcome, review.reviewNote ? `Комментарий: ${review.reviewNote}` : ""].filter(Boolean).join(" ") || null,
    link: `/dealer/licenses/${license.id}`,
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("licenses.cancel");

  const { id } = await ctx.params;
  const request = await db.cancellationRequest.findUnique({ where: { id } });
  if (!request) throw notFound("Заявка не найдена");

  await db.$transaction([
    db.cancellationRequest.delete({ where: { id } }),
    db.licenseAuditLog.create({
      data: {
        licenseId: request.licenseId,
        actorId: session.user.id,
        action: "EDITED",
        reason: `Удалена заявка на ${request.kind === "REFUND" ? "возврат" : "аннулирование"}: ${request.reason}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
});
