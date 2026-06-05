import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().min(3),
  email: z.string().email(),
  address: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: {
      phone: parsed.data.phone,
      email: parsed.data.email,
      address: parsed.data.address ?? null,
    },
    create: {
      id: "singleton",
      phone: parsed.data.phone,
      email: parsed.data.email,
      address: parsed.data.address ?? null,
      publicPhones: [],
    },
  });
  return NextResponse.json({ ok: true });
}
