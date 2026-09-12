import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generationSettingsSchema } from "@/lib/site-settings";
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

  const parsed = generationSettingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest(parsed.error.errors[0]?.message ?? "Некорректные данные");

  const generation = {
    ...parsed.data,
    blockedCustomVersions: parsed.data.blockedCustomVersions
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { generation },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      generation,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "generation",
    action: "UPDATED",
    summary: "Ограничения генерации",
  });

  return NextResponse.json({ ok: true });
});
