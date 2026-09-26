import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/api";
import { syncLicenseSlots } from "@/lib/license-slots";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("licenses.restore");

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
