import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { notifyAdminsLicenseCancelled } from "@/lib/notifications";
import { notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(10, "Минимум 10 символов") });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { id } = await ctx.params;
  const { reason } = await parseBody(req, schema);

  const license = await db.license.findUnique({ where: { id }, include: { dealer: true } });
  if (!license) throw notFound("Лицензия не найдена");

  // Прямое аннулирование — административное действие. Представитель на свою
  // лицензию подаёт заявку (/cancel-request), её рассматривает администратор.
  const isOwner = license.dealerId === session.user.id;
  if (!hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  if (license.status === "CANCELLED" || license.status === "REVOKED") {
    throw badRequest("Лицензия уже неактивна");
  }

  await db.$transaction([
    db.license.update({
      where: { id: license.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
    }),
    db.licenseAuditLog.create({
      data: { licenseId: license.id, actorId: session.user.id, action: "CANCELLED", reason },
    }),
  ]);

  // Аннулированная лицензия освобождает слот лимита представителя.
  await syncLicenseSlots(license.dealerId);

  await notifyAdminsLicenseCancelled({
    licenseNumber: license.number,
    dealerEmail: license.dealer.email,
    reason,
    by: session.user.email,
  });

  if (!isOwner) {
    await notifyUser(license.dealerId, {
      type: "LICENSE_CANCELLED",
      title: `Лицензия ${license.number} аннулирована`,
      body: reason,
      link: `/dealer/licenses/${license.id}`,
    });
  }

  return NextResponse.json({ ok: true });
});
