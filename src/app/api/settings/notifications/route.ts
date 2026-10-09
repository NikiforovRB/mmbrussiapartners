import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notificationSettingsSchema } from "@/lib/site-settings";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/notification-tabs";
import { parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const known = (types: string[]) => [...new Set(types)].filter((t) => t in NOTIFICATION_TYPE_LABEL);

export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");
  const d = await parseBody(req, notificationSettingsSchema);
  const notifications = {
    ...d,
    emailOff: known(d.emailOff),
    telegramOff: known(d.telegramOff),
    maxOff: known(d.maxOff),
  };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { notifications },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      notifications,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "notifications",
    action: "UPDATED",
    summary: `Уведомления: почта ${notifications.emailEnabled ? "вкл" : "выкл"}, Telegram ${notifications.telegramEnabled ? "вкл" : "выкл"}, MAX ${notifications.maxEnabled ? "вкл" : "выкл"}`,
  });

  return NextResponse.json({ ok: true });
});
