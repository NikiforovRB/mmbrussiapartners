import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportSettingsSchema } from "@/lib/site-settings";
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
