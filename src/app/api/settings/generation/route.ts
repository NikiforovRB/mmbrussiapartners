import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generationSettingsSchema } from "@/lib/site-settings";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");

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
