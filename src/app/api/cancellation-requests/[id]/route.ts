import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound, parseBody, route } from "@/lib/api";
import {
  notifyAdminsLicenseCancelled,
  notifyDealerCancellationReviewed,
} from "@/lib/notifications";
import { notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().nullable(),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("licenses.cancel");

  const { id } = await ctx.params;
  const { action, note } = await parseBody(req, schema);

  const request = await db.cancellationRequest.findUnique({
    where: { id },
    include: { license: { include: { dealer: true } } },
  });
  if (!request) throw notFound("Заявка не найдена");
  const approved = action === "approve";
  // Отклонённую заявку можно пересмотреть и одобрить, пока лицензия активна.
  if (approved) {
    if (request.status === "APPROVED") throw badRequest("Заявка уже одобрена");
    if (request.status === "REJECTED" && request.license.status !== "ACTIVE") {
      throw badRequest("Лицензия уже не активна — аннулировать нечего");
    }
  } else if (request.status !== "PENDING") {
    throw badRequest("Заявка уже рассмотрена");
  }

  const review = {
    status: approved ? ("APPROVED" as const) : ("REJECTED" as const),
    reviewedById: session.user.id,
    reviewNote: note || null,
    reviewedAt: new Date(),
  };

  if (approved) {
    await db.$transaction(async (tx) => {
      await tx.cancellationRequest.update({ where: { id }, data: review });
      if (request.license.status === "ACTIVE") {
        await tx.license.update({
          where: { id: request.licenseId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason: request.reason,
          },
        });
        await tx.licenseAuditLog.create({
          data: {
            licenseId: request.licenseId,
            actorId: session.user.id,
            action: "CANCELLED",
            reason: request.reason,
          },
        });
      }
    });
    await syncLicenseSlots(request.license.dealerId);
    await notifyAdminsLicenseCancelled({
      licenseNumber: request.license.number,
      dealerEmail: request.license.dealer.email,
      reason: request.reason,
      by: session.user.email,
    });
  } else {
    await db.cancellationRequest.update({ where: { id }, data: review });
  }

  await notifyDealerCancellationReviewed({
    licenseNumber: request.license.number,
    dealerEmail: request.license.dealer.email,
    approved,
    note: note || null,
    userId: request.license.dealerId,
  });
  await notifyUser(request.requestedById, {
    type: "CANCELLATION_REVIEWED",
    title: `Заявка по лицензии ${request.license.number} ${approved ? "одобрена" : "отклонена"}`,
    body: note || null,
    link: `/dealer/licenses/${request.licenseId}`,
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
        reason: `Удалена заявка на аннулирование: ${request.reason}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
});
