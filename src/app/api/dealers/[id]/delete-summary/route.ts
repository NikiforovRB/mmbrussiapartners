import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forbidden, notFound, route } from "@/lib/api";
import { dealerFootprint, describeFootprint, settleDealerReceipts } from "@/lib/dealer-delete";
import { hasAdminScope } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

/** Что удалится вместе с дилером — для окна подтверждения. */
export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission("dealers.delete", "Нет права на удаление дилеров");
  const { id } = await ctx.params;
  const target = await db.user.findUnique({
    where: { id },
    select: { isSuperAdmin: true, role: { select: { permissions: true } } },
  });
  if (!target) throw notFound("Дилер не найден");
  if (target.isSuperAdmin || hasAdminScope(target.role.permissions)) {
    throw forbidden("Это учётная запись сотрудника, а не дилера");
  }
  await settleDealerReceipts(id);
  const footprint = await dealerFootprint(id);
  return NextResponse.json({
    items: describeFootprint(footprint),
    legacyRecords: footprint.legacyRecords,
    paidPayments: footprint.paidPayments,
    blockers: footprint.blockers,
  });
});
