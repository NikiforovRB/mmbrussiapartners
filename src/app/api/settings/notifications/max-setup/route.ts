import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";
import { getMaxStatus, isMaxConfigured, setupMaxWebhook } from "@/lib/max";

export const runtime = "nodejs";

/** Подписывает бота MAX на вебхук кабинета — после этого бот отвечает на запуск по ссылке. */
export const POST = route(async () => {
  const session = await requirePermission("settings.edit");
  if (!isMaxConfigured()) {
    throw badRequest("MAX не настроен: задайте MAX_BOT_TOKEN и MAX_WEBHOOK_SECRET на сервере");
  }
  try {
    await setupMaxWebhook();
  } catch (err) {
    throw badRequest(`MAX не подключил вебхук: ${err instanceof Error ? err.message : "нет ответа"}`);
  }
  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "max",
    action: "UPDATED",
    summary: "Подключён вебхук бота MAX",
  });
  return NextResponse.json({ ok: true, status: await getMaxStatus() });
});
