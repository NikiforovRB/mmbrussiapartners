import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "roles.manage", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const role = await db.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: "Системная роль не редактируется" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const allowed = new Set(ALL_PERMISSIONS as readonly string[]);
  const filtered = parsed.data.permissions?.filter((p) => allowed.has(p));

  await db.role.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name.trim() }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description ?? null }),
      ...(filtered !== undefined && { permissions: filtered }),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "roles.manage", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (role.isSystem) return NextResponse.json({ error: "Системная роль не удаляется" }, { status: 400 });
  if (role._count.users > 0) {
    return NextResponse.json({ error: "К роли привязаны пользователи. Сначала переназначьте их." }, { status: 400 });
  }
  await db.role.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
