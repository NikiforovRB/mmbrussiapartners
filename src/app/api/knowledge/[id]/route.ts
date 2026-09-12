import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { blocksSchema } from "@/lib/knowledge";
import { sanitizeBlocks } from "@/lib/knowledge-server";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.string().max(80).nullable().optional(),
  excerpt: z.string().max(400).nullable().optional(),
  coverKey: z.string().nullable().optional(),
  blocks: blocksSchema.optional(),
  published: z.boolean().optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const article = await db.knowledgeArticle.findUnique({ where: { id } });
  if (!article) throw notFound("Статья не найдена");

  const data = await parseBody(req, schema);
  const update: Prisma.KnowledgeArticleUpdateInput = {};
  if (data.title !== undefined) update.title = data.title.trim();
  if (data.category !== undefined) update.category = data.category?.trim() || null;
  if (data.excerpt !== undefined) update.excerpt = data.excerpt?.trim() || null;
  if (data.coverKey !== undefined) update.coverKey = data.coverKey || null;
  if (data.published !== undefined) update.published = data.published;
  if (data.blocks !== undefined) {
    update.blocks = sanitizeBlocks(data.blocks) as unknown as Prisma.InputJsonValue;
  }

  await db.knowledgeArticle.update({ where: { id }, data: update });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: id,
    action: "KB_ARTICLE_UPDATED",
    summary: data.title?.trim() ?? article.title,
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const article = await db.knowledgeArticle.findUnique({ where: { id } });
  if (!article) throw notFound("Статья не найдена");

  await db.knowledgeArticle.delete({ where: { id } });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: id,
    action: "KB_ARTICLE_DELETED",
    summary: article.title,
  });

  return NextResponse.json({ ok: true });
});
