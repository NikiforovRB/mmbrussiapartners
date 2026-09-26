import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({ userId: z.string().min(1).nullable() });

/**
 * Привязка записи старого ЛК к представителю портала. Привязанный
 * представитель считается «старым»: первая генерация у него не по клиентской
 * цене. Отвязка снимает эту отметку — обычно это исправление ошибочной связи.
 */
export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.edit");
  const { id } = await ctx.params;
  const { userId } = await parseBody(req, schema);

  const legacy = await db.legacyDealer.findUnique({
    where: { id },
    select: { id: true, name: true, city: true, userId: true },
  });
  if (!legacy) throw notFound("Запись старого ЛК не найдена");
  const label = [legacy.name, legacy.city].filter(Boolean).join(", ");

  if (userId === null) {
    if (!legacy.userId) return NextResponse.json({ ok: true });
    const previous = legacy.userId;
    await db.$transaction([
      db.legacyDealer.update({ where: { id }, data: { userId: null } }),
      db.dealerProfile.updateMany({ where: { userId: previous }, data: { legacyDealer: false } }),
    ]);
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: previous,
      action: "LEGACY_UNLINKED",
      summary: `Отвязан от старого ЛК DriveMods: ${label}`,
    });
    return NextResponse.json({ ok: true });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, dealerProfile: { select: { id: true } }, legacyDealer: { select: { id: true, name: true } } },
  });
  if (!user?.dealerProfile) throw badRequest("Представитель не найден");
  if (user.legacyDealer && user.legacyDealer.id !== id) {
    throw conflict(`${user.email} уже привязан к записи «${user.legacyDealer.name}»`);
  }

  await db.$transaction([
    ...(legacy.userId && legacy.userId !== userId
      ? [db.dealerProfile.updateMany({ where: { userId: legacy.userId }, data: { legacyDealer: false } })]
      : []),
    db.legacyDealer.update({ where: { id }, data: { userId } }),
    db.dealerProfile.update({ where: { userId }, data: { legacyDealer: true } }),
  ]);
  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: userId,
    action: "LEGACY_LINKED",
    summary: `Привязан к старому ЛК DriveMods: ${label}`,
  });
  return NextResponse.json({ ok: true });
});
