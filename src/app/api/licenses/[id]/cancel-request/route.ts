import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { notifyAdminsCancellationRequest } from "@/lib/notifications";

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

  const license = await db.license.findUnique({ where: { id }, include: { dealer: true } });
  if (!license) return NextResponse.json({ error: "Лицензия не найдена" }, { status: 404 });

  const isOwner = license.dealerId === session.user.id;
  const canRequest =
    isOwner ||
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin);
  if (!canRequest) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (license.status !== "ACTIVE") {
    return NextResponse.json({ error: "Заявку можно подать только по активной лицензии" }, { status: 400 });
  }

  const existing = await db.cancellationRequest.findFirst({
    where: { licenseId: license.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "По этой лицензии уже есть заявка на рассмотрении" }, { status: 409 });
  }

  const request = await db.cancellationRequest.create({
    data: {
      licenseId: license.id,
      requestedById: session.user.id,
      reason: parsed.data.reason,
    },
  });

  await notifyAdminsCancellationRequest({
    licenseNumber: license.number,
    dealerEmail: license.dealer.email,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ ok: true, requestId: request.id });
}
