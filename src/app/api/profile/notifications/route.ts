import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, parseBody, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  notifyByEmail: z.boolean().optional(),
  notifyByTelegram: z.boolean().optional(),
});

/** Личные каналы уведомлений: почта и Telegram (если чат привязан). */
export const PATCH = route(async (req: Request) => {
  const session = await requireApprovedUser();
  const d = await parseBody(req, schema);
  if (d.notifyByTelegram) {
    const u = await db.user.findUnique({ where: { id: session.user.id }, select: { telegramChatId: true } });
    if (!u?.telegramChatId) throw badRequest("Сначала подключите Telegram");
  }
  const user = await db.user.update({
    where: { id: session.user.id },
    data: d,
    select: { notifyByEmail: true, notifyByTelegram: true },
  });
  return NextResponse.json(user);
});
