import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { homepageContentSchema } from "@/lib/homepage-content";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = homepageContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные главной страницы" }, { status: 400 });
  }

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { homepage: parsed.data },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      homepage: parsed.data,
    },
  });

  return NextResponse.json({ ok: true });
}
