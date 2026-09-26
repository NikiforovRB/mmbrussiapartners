import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(80, "Не длиннее 80 символов").optional(),
  move: z.enum(["up", "down"]).optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("settings.edit");
  const { id } = await ctx.params;
  const data = await parseBody(req, schema);
  if (data.name === undefined && data.move === undefined) throw badRequest("Нечего сохранять");

  const category = await db.knowledgeCategory.findUnique({ where: { id } });
  if (!category) throw notFound("Категория не найдена");

  if (data.name !== undefined && data.name !== category.name) {
    await db.knowledgeCategory.update({ where: { id }, data: { name: data.name } });
  }

  if (data.move) {
    // Порядок хранится числами; при перестановке нумеруем соседей заново,
    // чтобы не зависеть от совпадающих значений sortOrder.
    const siblings = await db.knowledgeCategory.findMany({
      where: { parentId: category.parentId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = data.move === "up" ? from - 1 : from + 1;
    if (from >= 0 && to >= 0 && to < ids.length) {
      [ids[from], ids[to]] = [ids[to], ids[from]];
      await db.$transaction(
        ids.map((siblingId, index) =>
          db.knowledgeCategory.update({ where: { id: siblingId }, data: { sortOrder: index } }),
        ),
      );
    }
  }

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: id,
    action: "KB_CATEGORY_UPDATED",
    summary: data.name && data.name !== category.name ? `${category.name} → ${data.name}` : category.name,
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("settings.edit");
  const { id } = await ctx.params;
  const category = await db.knowledgeCategory.findUnique({ where: { id } });
  if (!category) throw notFound("Категория не найдена");

  // Подкатегории удаляются каскадом, статьи остаются без категории.
  await db.knowledgeCategory.delete({ where: { id } });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: id,
    action: "KB_CATEGORY_DELETED",
    summary: category.name,
  });

  return NextResponse.json({ ok: true });
});
