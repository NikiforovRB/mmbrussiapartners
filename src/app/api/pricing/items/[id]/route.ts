import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { normalizeKey } from "@/lib/pricing";

export const runtime = "nodejs";

const schema = z.object({
  product: z.string().min(1).max(120).optional(),
  bundle: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  price: z.number().nonnegative().optional(),
});

function label(item: { product: string; bundle: string; region: string }) {
  return [item.product, item.bundle, item.region].filter(Boolean).join(" ");
}

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const item = await db.priceListItem.findUnique({ where: { id } });
  if (!item) throw notFound("Позиция не найдена");

  const data = await parseBody(req, schema);
  const product = data.product === undefined ? item.product : data.product.trim();
  const bundle = data.bundle === undefined ? item.bundle : normalizeKey(data.bundle);
  const region = data.region === undefined ? item.region : normalizeKey(data.region);

  if (product !== item.product || bundle !== item.bundle || region !== item.region) {
    const clash = await db.priceListItem.findUnique({
      where: { product_bundle_region: { product, bundle, region } },
    });
    if (clash && clash.id !== id) throw badRequest("Такая позиция уже есть в справочнике");
  }

  const updated = await db.priceListItem.update({
    where: { id },
    data: { product, bundle, region, ...(data.price !== undefined && { price: data.price }) },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "PRICE",
    entityId: id,
    action: "UPDATED",
    summary: label(updated),
    diff: {
      ...(label(updated) !== label(item) && { позиция: { from: label(item), to: label(updated) } }),
      ...(data.price !== undefined &&
        data.price !== Number(item.price) && {
          цена: { from: Number(item.price), to: data.price },
        }),
    },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const item = await db.priceListItem.findUnique({ where: { id } });
  if (!item) throw notFound("Позиция не найдена");

  // Индивидуальные цены уходят вместе с позицией: они на неё ссылаются.
  await db.priceListItem.delete({ where: { id } });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "PRICE",
    entityId: id,
    action: "DELETED",
    summary: label(item),
    diff: { цена: Number(item.price) },
  });

  return NextResponse.json({ ok: true });
});
