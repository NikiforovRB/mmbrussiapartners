import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { notifyAdmins, notifyUser } from "@/lib/app-notifications";
import { syncLicenseSlots } from "@/lib/license-slots";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(10, "Минимум 10 символов") });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

  const { id } = await ctx.params;
  const { reason } = await parseBody(req, schema);

  const license = await db.license.findUnique({ where: { id }, include: { dealer: true } });
  if (!license) throw notFound("Лицензия не найдена");

  // Прямое аннулирование — административное действие. Дилер на свою
  // лицензию подаёт заявку (/cancel-request), её рассматривает администратор.
  const isOwner = license.dealerId === session.user.id;
  if (!hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  if (license.status === "CANCELLED") {
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

  // Аннулированная лицензия освобождает слот лимита дилера.
  await syncLicenseSlots(license.dealerId);

  await notifyAdmins(
    ["licenses.cancel"],
    {
      type: "LICENSE_CANCELLED",
      title: `Аннулирована лицензия ${license.number}`,
      body: `${license.dealer.email} · аннулировал ${session.user.email}: ${reason}`,
      link: `/admin/licenses/${license.id}`,
    },
    { exceptUserId: session.user.id },
  );

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
