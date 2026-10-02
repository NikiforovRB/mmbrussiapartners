import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";
import { getTelegramStatus, isTelegramConfigured, setupTelegramWebhook } from "@/lib/telegram";

export const runtime = "nodejs";

/** Просит воркер поставить вебхук бота на себя — после этого бот отвечает на /start. */
export const POST = route(async () => {
  const session = await requirePermission("settings.edit");
  if (!isTelegramConfigured()) {
    throw badRequest("Telegram не настроен: задайте TELEGRAM_PROXY_URL и TELEGRAM_PROXY_SECRET на сервере");
  }
  try {
    await setupTelegramWebhook();
  } catch (err) {
    throw badRequest(`Воркер не смог подключить вебхук: ${err instanceof Error ? err.message : "нет ответа"}`);
  }
  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "telegram",
    action: "UPDATED",
    summary: "Подключён вебхук Telegram-бота",
  });
  return NextResponse.json({ ok: true, status: await getTelegramStatus() });
});
