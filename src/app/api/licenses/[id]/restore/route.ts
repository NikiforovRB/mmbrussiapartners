import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { forbidden, notFound, route, unauthenticated } from "@/lib/api";
import { syncLicenseSlots } from "@/lib/license-slots";

export const runtime = "nodejs";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "licenses.restore", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id }, select: { dealerId: true } });
  if (!license) throw notFound("Лицензия не найдена");

  await db.$transaction([
    db.license.update({ where: { id }, data: { deletedAt: null } }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "RESTORED" },
    }),
  ]);

  // Возвращённая из корзины лицензия снова занимает слот лимита.
  await syncLicenseSlots(license.dealerId);

  return NextResponse.json({ ok: true });
});
