import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const schema = z.object({
  adjustKind: z.enum(["NONE", "PERCENT", "FIXED"]),
  /** Процент или сумма — может быть отрицательной, это скидка. */
  adjustValue: z.number().nullable().optional(),
  /** price = null снимает личную цену: позиция вернётся к справочнику. */
  overrides: z
    .array(z.object({ itemId: z.string().min(1), price: z.number().nonnegative().nullable() }))
    .optional(),
});

export const PUT = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const profile = await db.dealerProfile.findUnique({
    where: { userId: id },
    select: { priceAdjustKind: true, priceAdjustValue: true },
  });
  if (!profile) throw notFound("Представитель не найден");

  const data = await parseBody(req, schema);
  const value = data.adjustKind === "NONE" ? null : (data.adjustValue ?? null);
  if (data.adjustKind !== "NONE" && value === null) {
    throw badRequest("Укажите величину пересчёта");
  }
  if (data.adjustKind === "PERCENT" && value !== null && value <= -100) {
    throw badRequest("Скидка не может быть 100% и больше");
  }

  const overrides = data.overrides ?? [];
  if (overrides.length > 0) {
    const known = await db.priceListItem.count({
      where: { id: { in: overrides.map((o) => o.itemId) } },
    });
    if (known !== new Set(overrides.map((o) => o.itemId)).size) {
      throw badRequest("Позиция справочника не найдена");
    }
  }

  await db.$transaction(async (tx) => {
    await tx.dealerProfile.update({
      where: { userId: id },
      data: { priceAdjustKind: data.adjustKind, priceAdjustValue: value },
    });
    for (const o of overrides) {
      if (o.price === null) {
        await tx.dealerPrice.deleteMany({ where: { dealerId: id, itemId: o.itemId } });
        continue;
      }
      await tx.dealerPrice.upsert({
        where: { dealerId_itemId: { dealerId: id, itemId: o.itemId } },
        create: { dealerId: id, itemId: o.itemId, price: o.price },
        update: { price: o.price },
      });
    }
  });

  const personal = await db.dealerPrice.count({ where: { dealerId: id } });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "PRICE",
    entityId: id,
    action: "UPDATED",
    summary: "Цены представителя",
    diff: {
      правило: { from: profile.priceAdjustKind, to: data.adjustKind },
      величина: {
        from: profile.priceAdjustValue === null ? null : Number(profile.priceAdjustValue),
        to: value,
      },
      личныхЦен: personal,
    },
  });

  return NextResponse.json({ ok: true });
});
