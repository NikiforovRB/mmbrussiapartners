import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  notifyAdminsLicenseCancelled,
  notifyDealerCancellationReviewed,
} from "@/lib/notifications";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const canReview =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin);
  if (!canReview) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const { action, note } = parsed.data;

  const request = await db.cancellationRequest.findUnique({
    where: { id },
    include: { license: { include: { dealer: true } } },
  });
  if (!request) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Заявка уже рассмотрена" }, { status: 400 });
  }

  if (action === "reject") {
    await db.cancellationRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: session.user.id,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });
    await notifyDealerCancellationReviewed({
      licenseNumber: request.license.number,
      dealerEmail: request.license.dealer.email,
      approved: false,
      note: note || null,
      userId: request.license.dealerId,
    });
    return NextResponse.json({ ok: true });
  }

  // approve → cancel the license
  await db.$transaction(async (tx) => {
    await tx.cancellationRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: session.user.id,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });
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

  await notifyAdminsLicenseCancelled({
    licenseNumber: request.license.number,
    dealerEmail: request.license.dealer.email,
    reason: request.reason,
    by: session.user.email,
  });
  await notifyDealerCancellationReviewed({
    licenseNumber: request.license.number,
    dealerEmail: request.license.dealer.email,
    approved: true,
    note: note || null,
    userId: request.license.dealerId,
  });

  return NextResponse.json({ ok: true });
}
