import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, forbidden, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { hasAdminScope } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { LEGACY_RECORD_TABS, legacyRecordWhere } from "@/lib/legacy-records";
import { formatRub } from "@/lib/money";
import { plural } from "@/lib/utils";

export const runtime = "nodejs";

const MAX_RECORDS = 20_000;
const CHUNK = 5_000;

const schema = z
  .object({
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
    /** Одна сумма для всех записей; без неё сумма записей не меняется. */
    amount: z.number().min(0, "Сумма не может быть отрицательной").max(100_000_000).nullable().optional(),
  })
  .refine((d) => Boolean(d.ids?.length) || Boolean(d.filter), { message: "Не выбраны записи" });

/**
 * Отмечает записи старого ЛК DriveMods оплаченными. Это отметка портала:
 * в ЛК DriveMods ничего не меняется, а повторный импорт её не затирает.
 */
export const POST = route(async (req: Request) => {
  const session = await requirePermission("payments.manage", "Нет права отмечать оплату");
  if (!hasAdminScope(session.user.permissions, session.user.isSuperAdmin)) {
    throw forbidden("Отмечать оплату может только администратор");
  }
  const d = await parseBody(req, schema);

  // Оплаты в ЛК сами являются деньгами — отмечать их оплаченными незачем.
  const where = {
    ...(d.ids?.length ? { id: { in: [...new Set(d.ids)] } } : legacyRecordWhere(d.filter!)),
    kind: { in: ["LICENSE" as const, "SERVICE" as const] },
  };
  const rows = await db.legacyRecord.findMany({ where, select: { id: true }, take: MAX_RECORDS + 1 });
  if (rows.length === 0) throw badRequest("Среди выбранных нет лицензий и услуг");
  if (rows.length > MAX_RECORDS) throw badRequest(`За раз — не больше ${MAX_RECORDS} записей, сузьте фильтр`);

  const ids = rows.map((r) => r.id);
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      await tx.legacyRecord.updateMany({
        where: { id: { in: ids.slice(i, i + CHUNK) } },
        data: {
          paymentStatus: "PAID",
          manualPayment: true,
          manualPaidAt: now,
          manualPaidById: session.user.id,
          ...(d.amount != null ? { priceTotal: d.amount } : {}),
        },
      });
    }
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "PAYMENT",
    entityId: ids[0],
    action: "LEGACY_MARKED_PAID",
    summary: `ЛК DriveMods: отмечено оплаченными ${ids.length} ${plural(ids.length, ["запись", "записи", "записей"])}${
      d.amount != null ? `, сумма ${formatRub(d.amount)} за каждую` : ""
    }`,
    diff: { records: ids.length, ids: ids.slice(0, 200) },
  });

  return NextResponse.json({ ok: true, count: ids.length });
});
