import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supportSettingsSchema } from "@/lib/site-settings";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");

  const parsed = supportSettingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest(parsed.error.errors[0]?.message ?? "Некорректные данные");

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { support: parsed.data },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      support: parsed.data,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "support",
    action: "UPDATED",
    summary: "Раздел «Техподдержка»",
  });

  return NextResponse.json({ ok: true });
});
