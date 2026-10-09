import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";
import { LEGACY_RECORD_TABS, legacyRecordWhere } from "@/lib/legacy-records";
import { plural } from "@/lib/utils";

export const runtime = "nodejs";

const MAX_RECORDS = 20_000;
const CHUNK = 5_000;

const schema = z
  .object({
    action: z.enum(["assign", "reset"]),
    userId: z.string().min(1).optional(),
    ids: z.array(z.string().min(1).max(40)).max(MAX_RECORDS).optional(),
    filter: z
      .object({
        tab: z.enum(LEGACY_RECORD_TABS),
        q: z.string().max(200).optional(),
        owner: z.enum(["assigned", "unassigned", "manual"]).optional(),
        pay: z.enum(["paid", "unpaid"]).optional(),
        dealer: z.string().max(40).optional(),
        user: z.string().max(40).optional(),
      })
      .optional(),
    /** Вместе с лицензиями — оплаты, которыми они погашены. */
    withPayments: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.ids?.length) || Boolean(d.filter), { message: "Не выбраны записи" })
  .refine((d) => d.action !== "assign" || Boolean(d.userId), { message: "Не выбран дилер" });

const chunks = <T,>(list: T[]) =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Поштучное распределение записей старого ЛК по дилерам портала:
 * назначить выбранные (или все найденные по фильтру) либо вернуть их к
 * владельцу по привязке дилера старого ЛК.
 */
export const POST = route(async (req: Request) => {
  const session = await requirePermission("dealers.edit");
  const d = await parseBody(req, schema);

  let ids = d.ids?.length
    ? [...new Set(d.ids)]
    : (
        await db.legacyRecord.findMany({
          where: legacyRecordWhere(d.filter!),
          select: { id: true },
          take: MAX_RECORDS + 1,
        })
      ).map((r) => r.id);
  if (ids.length === 0) throw badRequest("По фильтру ничего не найдено");
  if (ids.length > MAX_RECORDS) throw badRequest(`За раз — не больше ${MAX_RECORDS} записей, сузьте фильтр`);

  if (d.action === "assign" && d.withPayments) {
    const payments = await db.legacyRecord.findMany({
      where: { id: { in: ids }, kind: "LICENSE", paidById: { not: null } },
      select: { paidById: true },
      distinct: ["paidById"],
    });
    ids = [...new Set([...ids, ...payments.map((p) => p.paidById!)])];
  }

  const before = await db.legacyRecord.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, userId: true, manualAssign: true },
  });
  const describe = (rows: { kind: string }[]) => {
    const count = (k: string) => rows.filter((r) => r.kind === k).length;
    const licenses = count("LICENSE");
    const payments = count("PAYMENT");
    const other = rows.length - licenses - payments;
    return [
      licenses ? `${licenses} ${plural(licenses, ["лицензия", "лицензии", "лицензий"])}` : null,
      payments ? `${payments} ${plural(payments, ["оплата", "оплаты", "оплат"])}` : null,
      other ? `${other} ${plural(other, ["прочая запись", "прочие записи", "прочих записей"])}` : null,
    ]
      .filter(Boolean)
      .join(", ");
  };

  if (d.action === "assign") {
    const target = await db.user.findUnique({
      where: { id: d.userId! },
      select: { id: true, email: true, dealerProfile: { select: { id: true } } },
    });
    if (!target?.dealerProfile) throw badRequest("Дилер не найден");
    const moved = before.filter((r) => r.userId !== target.id || !r.manualAssign);
    const now = new Date();
    await db.$transaction(async (tx) => {
      for (const part of chunks(moved.map((r) => r.id))) {
        await tx.legacyRecord.updateMany({
          where: { id: { in: part } },
          data: { userId: target.id, manualAssign: true, assignedAt: now, assignedById: session.user.id },
        });
      }
      await tx.dealerProfile.update({ where: { userId: target.id }, data: { legacyDealer: true } });
    });

    if (moved.length) {
      await recordAdminAction({
        actorId: session.user.id,
        entity: "DEALER",
        entityId: target.id,
        action: "LEGACY_RECORDS_ASSIGNED",
        summary: `Назначено из старого ЛК DriveMods: ${describe(moved)}`,
        diff: { records: moved.length, ids: moved.slice(0, 200).map((r) => r.id) },
      });
    }
    const taken = new Map<string, typeof moved>();
    for (const r of moved) {
      if (r.userId && r.userId !== target.id) taken.set(r.userId, [...(taken.get(r.userId) ?? []), r]);
    }
    for (const [previous, rows] of taken) {
      await recordAdminAction({
        actorId: session.user.id,
        entity: "DEALER",
        entityId: previous,
        action: "LEGACY_RECORDS_REMOVED",
        summary: `Передано ${target.email}: ${describe(rows)} из старого ЛК DriveMods`,
        diff: { records: rows.length, ids: rows.slice(0, 200).map((r) => r.id) },
      });
    }
    return NextResponse.json({ ok: true, count: moved.length });
  }

  const manual = before.filter((r) => r.manualAssign);
  for (const part of chunks(manual.map((r) => r.id))) {
    await db.$executeRaw`
      UPDATE "LegacyRecord" r
      SET "manualAssign" = false, "assignedAt" = NULL, "assignedById" = NULL,
          "userId" = (SELECT d."userId" FROM "LegacyDealer" d WHERE d."id" = r."legacyDealerId")
      WHERE r."id" = ANY(${part}::text[])`;
  }
  const byOwner = new Map<string, typeof manual>();
  for (const r of manual) if (r.userId) byOwner.set(r.userId, [...(byOwner.get(r.userId) ?? []), r]);
  for (const [owner, rows] of byOwner) {
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: owner,
      action: "LEGACY_RECORDS_RESET",
      summary: `Снято ручное назначение: ${describe(rows)} из старого ЛК DriveMods`,
      diff: { records: rows.length, ids: rows.slice(0, 200).map((r) => r.id) },
    });
  }
  return NextResponse.json({ ok: true, count: manual.length });
});
