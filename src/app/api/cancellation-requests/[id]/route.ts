import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import {
  notifyAdminsLicenseCancelled,
  notifyDealerCancellationReviewed,
} from "@/lib/notifications";
import { notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().nullable(),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const { action, note } = await parseBody(req, schema);

  const request = await db.cancellationRequest.findUnique({
    where: { id },
    include: { license: { include: { dealer: true } } },
  });
  if (!request) throw notFound("Заявка не найдена");
  if (request.status !== "PENDING") throw badRequest("Заявка уже рассмотрена");

  const approved = action === "approve";
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
