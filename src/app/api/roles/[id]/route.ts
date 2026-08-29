import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "roles.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const role = await db.role.findUnique({ where: { id } });
  if (!role) throw notFound("Роль не найдена");
  if (role.isSystem) throw badRequest("Системная роль не редактируется");

  const data = await parseBody(req, schema);
  const allowed = new Set(ALL_PERMISSIONS as readonly string[]);
  const permissions = data.permissions?.filter((p) => allowed.has(p));

  await db.role.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(permissions !== undefined && { permissions }),
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: id,
    action: "UPDATED",
    summary: data.name?.trim() ?? role.name,
    ...(permissions !== undefined && {
      diff: {
        added: permissions.filter((p) => !role.permissions.includes(p)),
        removed: role.permissions.filter((p) => !permissions.includes(p)),
      },
    }),
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "roles.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const role = await db.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw notFound("Роль не найдена");
  if (role.isSystem) throw badRequest("Системная роль не удаляется");
  if (role._count.users > 0) {
    throw badRequest("К роли привязаны пользователи. Сначала переназначьте их.");
  }

  await db.role.delete({ where: { id } });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: id,
    action: "DELETED",
    summary: role.name,
  });

  return NextResponse.json({ ok: true });
});
