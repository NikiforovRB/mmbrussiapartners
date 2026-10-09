import { NextResponse } from "next/server";
import { z } from "zod";
import { forbidden, parseBody, route } from "@/lib/api";
import { hasAdminScope } from "@/lib/permissions";
import { resolvePrices } from "@/lib/pricing";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  dealerId: z.string().min(1),
  items: z
    .array(
      z.object({
        product: z.string().min(1).max(120),
        bundle: z.string().max(60).nullable().optional(),
        region: z.string().max(60).nullable().optional(),
      }),
    )
    .max(50),
});

/**
 * Цены комплектаций для конкретного дилера: администратор выбирает в мастере
 * генерации, на кого выдать лицензию, и видит ту сумму, что уйдёт в счёт.
 */
export const POST = route(async (req: Request) => {
  const session = await requirePermission("licenses.create");
  if (!hasAdminScope(session.user.permissions, session.user.isSuperAdmin)) {
    throw forbidden("Цены дилеров видит только администратор");
  }
  const { dealerId, items } = await parseBody(req, schema);
  const prices = await resolvePrices(dealerId, items);
  return NextResponse.json({
    prices: prices.map((p) => ({ price: p.price, priced: p.itemId !== null })),
  });
});
