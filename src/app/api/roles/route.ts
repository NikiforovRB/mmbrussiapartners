import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { conflict, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1, "Укажите название роли"),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).default([]),
});

export const POST = route(async (req: Request) => {
  const session = await requirePermission("roles.manage");

  const data = await parseBody(req, schema);
  const allowed = new Set(ALL_PERMISSIONS as readonly string[]);
  const permissions = data.permissions.filter((p) => allowed.has(p));

  const role = await db.role
    .create({
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        permissions,
        isSystem: false,
      },
    })
    .catch(() => {
      throw conflict("Роль с таким названием уже существует");
    });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: role.id,
    action: "CREATED",
    summary: role.name,
    diff: { permissions },
  });

  return NextResponse.json({ id: role.id });
});
