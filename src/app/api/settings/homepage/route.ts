import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { homepageContentSchema } from "@/lib/homepage-content";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

export const PATCH = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const parsed = homepageContentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest("Некорректные данные главной страницы");

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

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "homepage",
    action: "UPDATED",
    summary: "Содержимое главной страницы",
  });

  return NextResponse.json({ ok: true });
});
