import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { homepageContentSchema } from "@/lib/homepage-content";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");

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
