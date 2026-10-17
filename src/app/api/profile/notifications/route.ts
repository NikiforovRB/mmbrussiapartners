import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, forbidden, parseBody, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";
import { hasAdminScope } from "@/lib/permissions";
import { MUTABLE_NOTIFICATION_TABS } from "@/lib/notification-tabs";

export const runtime = "nodejs";

const schema = z.object({
  notifyByEmail: z.boolean().optional(),
  notifyByTelegram: z.boolean().optional(),
  notifyByMax: z.boolean().optional(),
  /** Отключённые разделы колокольчика — только у администраторов. */
  mutedTabs: z.array(z.enum(MUTABLE_NOTIFICATION_TABS)).max(MUTABLE_NOTIFICATION_TABS.length).optional(),
});

/** Личные каналы уведомлений: почта, Telegram и MAX (если диалог с ботом привязан). */
export const PATCH = route(async (req: Request) => {
  const session = await requireApprovedUser();
  const { mutedTabs, ...channels } = await parseBody(req, schema);
  if (mutedTabs && !hasAdminScope(session.user.permissions, session.user.isSuperAdmin)) {
    throw forbidden("Отключать разделы уведомлений могут только администраторы");
  }
  if (channels.notifyByTelegram || channels.notifyByMax) {
    const u = await db.user.findUnique({
      where: { id: session.user.id },
      select: { telegramChatId: true, maxUserId: true },
    });
    if (channels.notifyByTelegram && !u?.telegramChatId) throw badRequest("Сначала подключите Telegram");
    if (channels.notifyByMax && !u?.maxUserId) throw badRequest("Сначала подключите MAX");
  }
  const user = await db.user.update({
    where: { id: session.user.id },
    data: { ...channels, ...(mutedTabs && { notifyMutedTabs: [...new Set(mutedTabs)] }) },
    select: { notifyByEmail: true, notifyByTelegram: true, notifyByMax: true, notifyMutedTabs: true },
  });
  return NextResponse.json(user);
});
