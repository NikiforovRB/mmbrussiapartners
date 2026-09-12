import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { announcementSchema } from "@/lib/site-settings";
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

  const parsed = announcementSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest("Некорректные данные объявления");

  const announcement = { ...parsed.data, updatedAt: new Date().toISOString() };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { announcement },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      announcement,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "announcement",
    action: "UPDATED",
    summary: announcement.enabled ? "Объявление включено" : "Объявление выключено",
  });

  return NextResponse.json({ ok: true });
});
