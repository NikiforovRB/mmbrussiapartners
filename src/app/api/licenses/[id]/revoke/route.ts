import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(6) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "licenses.revoke", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Укажите причину" }, { status: 400 });

  const license = await db.license.findUnique({ where: { id } });
  if (!license) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await db.$transaction([
    db.license.update({
      where: { id },
      data: { status: "REVOKED", cancellationReason: parsed.data.reason, cancelledAt: new Date() },
    }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "REVOKED", reason: parsed.data.reason },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
