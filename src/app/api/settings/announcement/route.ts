import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcementSchema } from "@/lib/site-settings";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");

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
