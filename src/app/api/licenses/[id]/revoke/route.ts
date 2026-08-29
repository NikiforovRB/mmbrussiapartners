import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(6, "Укажите причину") });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "licenses.revoke", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const { reason } = await parseBody(req, schema);

  const license = await db.license.findUnique({ where: { id } });
  if (!license) throw notFound("Лицензия не найдена");
  if (license.status === "REVOKED") throw badRequest("Лицензия уже отозвана");

  await db.$transaction([
    db.license.update({
      where: { id },
      data: { status: "REVOKED", cancellationReason: reason, cancelledAt: new Date() },
    }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "REVOKED", reason },
    }),
  ]);

  // Отозванная лицензия освобождает слот лимита представителя.
  await syncLicenseSlots(license.dealerId);

  await notifyUser(license.dealerId, {
    type: "LICENSE_REVOKED",
    title: `Лицензия ${license.number} отозвана`,
    body: reason,
    link: `/dealer/licenses/${license.id}`,
  });

  return NextResponse.json({ ok: true });
});
