import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { blocksSchema, slugify } from "@/lib/knowledge";
import { sanitizeBlocks } from "@/lib/knowledge-server";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().min(1, "Укажите заголовок").max(200),
  category: z.string().max(80).nullable().optional(),
  excerpt: z.string().max(400).nullable().optional(),
  coverKey: z.string().nullable().optional(),
  blocks: blocksSchema,
  published: z.boolean().optional(),
});

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  // Ищем свободный slug, добавляя суффикс при коллизии.
  while (await db.knowledgeArticle.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export const POST = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");

  const data = await parseBody(req, schema);
  const slug = await uniqueSlug(slugify(data.title));
  const blocks = sanitizeBlocks(data.blocks);

  const article = await db.knowledgeArticle.create({
    data: {
      title: data.title.trim(),
      slug,
      category: data.category?.trim() || null,
      excerpt: data.excerpt?.trim() || null,
      coverKey: data.coverKey || null,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      published: data.published ?? false,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: article.id,
    action: "KB_ARTICLE_CREATED",
    summary: article.title,
  });

  return NextResponse.json({ id: article.id, slug: article.slug });
});
