import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";
import { getBotUsername, isTelegramConfigured, telegramApi } from "@/lib/telegram";

export const runtime = "nodejs";

const LINK_TTL_MS = 15 * 60_000;

async function status(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, telegramName: true, telegramLinkedAt: true, notifyByTelegram: true },
  });
  return {
    linked: Boolean(u?.telegramChatId),
    name: u?.telegramName ?? null,
    linkedAt: u?.telegramLinkedAt?.toISOString() ?? null,
    enabled: u?.notifyByTelegram ?? false,
  };
}

export const GET = route(async () => {
  const session = await requireApprovedUser();
  return NextResponse.json(await status(session.user.id));
});

/** Одноразовая ссылка t.me/<бот>?start=<код>: бот по коду узнаёт, чей это чат. */
export const POST = route(
  async () => {
    const session = await requireApprovedUser();
    if (!isTelegramConfigured()) throw badRequest("Telegram-бот ещё не подключён администратором");
    const bot = await getBotUsername();
    if (!bot) throw badRequest("Бот Telegram сейчас не отвечает, попробуйте позже");

    const code = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await db.user.update({
      where: { id: session.user.id },
      data: { telegramLinkCode: code, telegramLinkCodeExpiresAt: expiresAt },
    });
    return NextResponse.json({ url: `https://t.me/${bot}?start=${code}`, expiresAt: expiresAt.toISOString() });
  },
  { rateLimit: { limit: 10, windowMs: 10 * 60_000, name: "telegram-link" } },
);

export const DELETE = route(async () => {
  const session = await requireApprovedUser();
  const before = await db.user.findUnique({ where: { id: session.user.id }, select: { telegramChatId: true } });
  await db.user.update({
    where: { id: session.user.id },
    data: {
      telegramChatId: null,
      telegramName: null,
      telegramLinkedAt: null,
      telegramLinkCode: null,
      telegramLinkCodeExpiresAt: null,
      notifyByTelegram: false,
    },
  });
  if (before?.telegramChatId && isTelegramConfigured()) {
    await telegramApi("sendMessage", {
      chat_id: before.telegramChatId,
      text: "Уведомления кабинета MMB RUSSIA в этом чате отключены.",
    }).catch(() => {});
  }
  return NextResponse.json(await status(session.user.id));
});
