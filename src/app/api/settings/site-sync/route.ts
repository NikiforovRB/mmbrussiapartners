import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { isSiteSyncConfigured, runFullSiteSync } from "@/lib/site-dealers";

export const runtime = "nodejs";

const schema = z.object({ dryRun: z.boolean() });

/** Полная сверка «Дилерской сети» на сайте по кнопке администратора. */
export const POST = route(async (req: Request) => {
  const session = await requirePermission("dealers.approve", "Нет права управлять публикацией на сайте");
  const { dryRun } = await parseBody(req, schema);
  if (!isSiteSyncConfigured()) {
    throw badRequest("Интеграция не настроена: задайте MMB_SITE_URL и MMB_DEALERS_SYNC_SECRET на сервере");
  }
  const result = await runFullSiteSync({ dryRun, trigger: "manual", actorId: session.user.id });
  return NextResponse.json({ ok: true, result });
});
