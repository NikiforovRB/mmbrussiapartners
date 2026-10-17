import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { changedFields, recordAdminAction } from "@/lib/admin-audit";
import { notifyUser } from "@/lib/app-notifications";
import { hasPermission } from "@/lib/permissions";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500, "Причина — не длиннее 500 символов").nullable().optional(),
});

/**
 * Решение по заявке дилера на доступ к ЛК DriveMods. Включить или выключить
 * доступ без заявки можно переключателем в карточке; здесь — ответ на заявку,
 * о котором дилер получает уведомление.
 */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();
  const can = (p: "dealers.approve" | "dealers.edit") =>
    hasPermission(session.user.permissions, p, session.user.isSuperAdmin);
  if (!can("dealers.approve") && !can("dealers.edit")) {
    throw forbidden("Нет права рассматривать заявки на доступ к ЛК DriveMods");
  }
  const { id } = await ctx.params;
  const d = await parseBody(req, schema);

  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, dealerProfile: { select: { driveModsAccess: true, driveModsRequestedAt: true } } },
  });
  const profile = target?.dealerProfile;
  if (!target || !profile) throw notFound("Дилер не найден");
  if (profile.driveModsAccess) throw badRequest("Доступ уже подключён");
  if (!profile.driveModsRequestedAt) throw badRequest("Заявки на доступ нет");

  if (d.action === "approve") {
    await db.dealerProfile.update({
      where: { userId: id },
      data: {
        driveModsAccess: true,
        driveModsRequestedAt: null,
        driveModsRejectedAt: null,
        driveModsRejectReason: null,
      },
    });
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: id,
      action: "DRIVEMODS_ACCESS_GRANTED",
      summary: target.email,
      diff: changedFields({ driveModsAccess: false }, { driveModsAccess: true }),
    });
    await notifyUser(id, {
      type: "DEALER_APPROVED",
      title: "Доступ к ЛК DriveMods подключён",
      body: "Заявка одобрена — администратор подключил вам доступ к личному кабинету DriveMods.",
      link: "/dealer/profile",
    });
    return NextResponse.json({ ok: true });
  }

  const reason = d.reason || null;
  await db.dealerProfile.update({
    where: { userId: id },
    data: { driveModsRequestedAt: null, driveModsRejectedAt: new Date(), driveModsRejectReason: reason },
  });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: "DRIVEMODS_REQUEST_REJECTED",
    summary: target.email,
    diff: reason ? { driveModsRejectReason: reason } : null,
  });
  await notifyUser(id, {
    type: "DEALER_REJECTED",
    title: "Заявка на доступ к ЛК DriveMods отклонена",
    body: reason,
    link: "/dealer/profile",
  });
  return NextResponse.json({ ok: true });
});
