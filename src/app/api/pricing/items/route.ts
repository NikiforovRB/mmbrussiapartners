import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { normalizeKey } from "@/lib/pricing";

export const runtime = "nodejs";

const schema = z.object({
  product: z.string().min(1, "Укажите продукт").max(120),
  bundle: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  price: z.number().nonnegative("Цена не может быть отрицательной"),
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const data = await parseBody(req, schema);
  const product = data.product.trim();
  const bundle = normalizeKey(data.bundle);
  const region = normalizeKey(data.region);

  const exists = await db.priceListItem.findUnique({
    where: { product_bundle_region: { product, bundle, region } },
  });
  if (exists) throw badRequest("Такая позиция уже есть в справочнике");

  const item = await db.priceListItem.create({
    data: { product, bundle, region, price: data.price },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "PRICE",
    entityId: item.id,
    action: "CREATED",
    summary: [product, bundle, region].filter(Boolean).join(" "),
    diff: { price: data.price },
  });

  return NextResponse.json({ id: item.id });
});
