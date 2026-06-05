import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "roles.manage", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const allowed = new Set(ALL_PERMISSIONS as readonly string[]);
  const filtered = parsed.data.permissions.filter((p) => allowed.has(p));

  try {
    const role = await db.role.create({
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description ?? null,
        permissions: filtered,
        isSystem: false,
      },
    });
    return NextResponse.json({ id: role.id });
  } catch {
    return NextResponse.json({ error: "Роль с таким названием уже существует" }, { status: 409 });
  }
}
