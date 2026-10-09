import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";
import { getMaxBotUsername, isMaxConfigured, sendMaxMessage } from "@/lib/max";

export const runtime = "nodejs";

const LINK_TTL_MS = 15 * 60_000;

async function status(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { maxUserId: true, maxName: true, maxLinkedAt: true, notifyByMax: true },
  });
  return {
    linked: Boolean(u?.maxUserId),
    name: u?.maxName ?? null,
    linkedAt: u?.maxLinkedAt?.toISOString() ?? null,
    enabled: u?.notifyByMax ?? false,
  };
}

export const GET = route(async () => {
  const session = await requireApprovedUser();
  return NextResponse.json(await status(session.user.id));
});

/** Одноразовая ссылка max.ru/<бот>?start=<код>: бот по коду узнаёт, чей это диалог. */
export const POST = route(
  async () => {
    const session = await requireApprovedUser();
    if (!isMaxConfigured()) throw badRequest("Бот MAX ещё не подключён администратором");
    const bot = await getMaxBotUsername();
    if (!bot) throw badRequest("Бот MAX сейчас не отвечает, попробуйте позже");

    const code = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await db.user.update({
      where: { id: session.user.id },
      data: { maxLinkCode: code, maxLinkCodeExpiresAt: expiresAt },
    });
    return NextResponse.json({ url: `https://max.ru/${bot}?start=${code}`, expiresAt: expiresAt.toISOString() });
  },
  { rateLimit: { limit: 10, windowMs: 10 * 60_000, name: "max-link" } },
);

export const DELETE = route(async () => {
  const session = await requireApprovedUser();
  const before = await db.user.findUnique({ where: { id: session.user.id }, select: { maxUserId: true } });
  await db.user.update({
    where: { id: session.user.id },
    data: {
      maxUserId: null,
      maxName: null,
      maxLinkedAt: null,
      maxLinkCode: null,
      maxLinkCodeExpiresAt: null,
      notifyByMax: false,
    },
  });
  if (before?.maxUserId && isMaxConfigured()) {
    await sendMaxMessage({
      maxUserId: before.maxUserId,
      text: "Уведомления кабинета MMB RUSSIA в этом диалоге отключены.",
    }).catch(() => {});
  }
  return NextResponse.json(await status(session.user.id));
});
