import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { notifyAdminsLicenseCancelled } from "@/lib/notifications";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(10, "Минимум 10 символов") });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Укажите причину" }, { status: 400 });
  }

  const license = await db.license.findUnique({
    where: { id },
    include: { dealer: true },
  });
  if (!license) return NextResponse.json({ error: "Лицензия не найдена" }, { status: 404 });

  const isOwner = license.dealerId === session.user.id;
  const canCancel =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin) ||
    isOwner;
  if (!canCancel) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (license.status === "CANCELLED" || license.status === "REVOKED") {
    return NextResponse.json({ error: "Лицензия уже неактивна" }, { status: 400 });
  }

  await db.$transaction([
    db.license.update({
      where: { id: license.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: parsed.data.reason,
      },
    }),
    db.licenseAuditLog.create({
      data: {
        licenseId: license.id,
        actorId: session.user.id,
        action: "CANCELLED",
        reason: parsed.data.reason,
      },
    }),
  ]);

  await notifyAdminsLicenseCancelled({
    licenseNumber: license.number,
    dealerEmail: license.dealer.email,
    reason: parsed.data.reason,
    by: session.user.email,
  });

  return NextResponse.json({ ok: true });
}
