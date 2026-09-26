import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(80, "Не длиннее 80 символов"),
  parentId: z.string().max(40).nullable().optional(),
});

export const POST = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");
  const data = await parseBody(req, schema);
  const parentId = data.parentId || null;

  if (parentId) {
    const parent = await db.knowledgeCategory.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (!parent) throw badRequest("Родительская категория не найдена");
    if (parent.parentId) throw badRequest("Вложенность — не больше двух уровней");
  }

  const last = await db.knowledgeCategory.findFirst({
    where: { parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const category = await db.knowledgeCategory.create({
    data: { name: data.name, parentId, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: category.id,
    action: "KB_CATEGORY_CREATED",
    summary: category.name,
  });

  return NextResponse.json({ id: category.id });
});
