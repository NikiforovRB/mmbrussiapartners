import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";
import { syncLegacyRecordOwners } from "@/lib/legacy-records";

export const runtime = "nodejs";

const schema = z.object({ userId: z.string().min(1).nullable() });

/**
 * Привязка записи старого ЛК к дилеру портала. Привязанный
 * дилер отмечается как работавший в ЛК DriveMods. Отвязка снимает
 * эту отметку — обычно это исправление ошибочной связи.
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
    if (!legacy.userId) return NextResponse.json({ ok: true, records: 0 });
    const previous = legacy.userId;
    const records = await db.$transaction(async (tx) => {
      await tx.legacyDealer.update({ where: { id }, data: { userId: null } });
      await tx.dealerProfile.updateMany({ where: { userId: previous }, data: { legacyDealer: false } });
      return syncLegacyRecordOwners(id, null, tx);
    });
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: previous,
      action: "LEGACY_UNLINKED",
      summary: `Отвязан от старого ЛК DriveMods: ${label}${records ? ` · снято записей: ${records}` : ""}`,
    });
    return NextResponse.json({ ok: true, records });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, dealerProfile: { select: { id: true } }, legacyDealer: { select: { id: true, name: true } } },
  });
  if (!user?.dealerProfile) throw badRequest("Дилер не найден");
  if (user.legacyDealer && user.legacyDealer.id !== id) {
    throw conflict(`${user.email} уже привязан к записи «${user.legacyDealer.name}»`);
  }

  const records = await db.$transaction(async (tx) => {
    if (legacy.userId && legacy.userId !== userId) {
      await tx.dealerProfile.updateMany({ where: { userId: legacy.userId }, data: { legacyDealer: false } });
    }
    await tx.legacyDealer.update({ where: { id }, data: { userId } });
    await tx.dealerProfile.update({ where: { userId }, data: { legacyDealer: true } });
    return syncLegacyRecordOwners(id, userId, tx);
  });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: userId,
    action: "LEGACY_LINKED",
    summary: `Привязан к старому ЛК DriveMods: ${label}${records ? ` · передано записей: ${records}` : ""}`,
  });
  return NextResponse.json({ ok: true, records });
});
