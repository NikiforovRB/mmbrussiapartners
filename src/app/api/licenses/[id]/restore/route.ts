import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "licenses.restore", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  await db.$transaction([
    db.license.update({ where: { id }, data: { deletedAt: null } }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "RESTORED" },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
