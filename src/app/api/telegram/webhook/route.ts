import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { cabinetUrl } from "@/lib/cabinet-origin";
import { escapeTelegramHtml, isProxyRequest, telegramApi } from "@/lib/telegram";

export const runtime = "nodejs";

type Update = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { username?: string; first_name?: string; last_name?: string };
  };
};

async function reply(chatId: number, text: string) {
  await telegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" }).catch((err) =>
    console.error("[telegram] ответ боту не ушёл", err),
  );
}

/**
 * Обновления бота. Telegram шлёт их воркеру Cloudflare, тот пересылает сюда
 * с заголовком X-Proxy-Secret. Бот понимает /start <код> (привязка из профиля)
 * и /stop (отключить уведомления в этом чате).
 */
export const POST = route(async (req: Request) => {
  if (!isProxyRequest(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update = (await req.json().catch(() => ({}))) as Update;
  const msg = update.message;
  const chatId = msg?.chat?.id;
  if (!msg?.text || typeof chatId !== "number" || msg.chat?.type !== "private") {
    return NextResponse.json({ ok: true });
  }
  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  const chat = String(chatId);

  if (command === "/start" && arg) {
    const user = await db.user.findUnique({
      where: { telegramLinkCode: arg.slice(0, 64) },
      select: { id: true, email: true, telegramLinkCodeExpiresAt: true },
    });
    if (!user || !user.telegramLinkCodeExpiresAt || user.telegramLinkCodeExpiresAt < new Date()) {
      await reply(
        chatId,
        "Ссылка устарела или уже использована. Откройте профиль в кабинете MMB RUSSIA и нажмите «Подключить Telegram» ещё раз.",
      );
      return NextResponse.json({ ok: true });
    }
    const from = msg.from;
    const name = from?.username
      ? `@${from.username}`
      : [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null;
    await db.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: chat,
        telegramName: name?.slice(0, 100) ?? null,
        telegramLinkedAt: new Date(),
        notifyByTelegram: true,
        telegramLinkCode: null,
        telegramLinkCodeExpiresAt: null,
      },
    });
    await reply(
      chatId,
      `Готово: уведомления кабинета MMB RUSSIA для <b>${escapeTelegramHtml(user.email)}</b> будут приходить сюда.\n\nОтключить — команда /stop или переключатель в профиле кабинета.`,
    );
    return NextResponse.json({ ok: true });
  }

  if (command === "/stop") {
    const { count } = await db.user.updateMany({
      where: { telegramChatId: chat },
      data: { telegramChatId: null, telegramName: null, telegramLinkedAt: null, notifyByTelegram: false },
    });
    await reply(
      chatId,
      count > 0
        ? "Уведомления отключены. Подключить снова можно в профиле кабинета."
        : "Этот чат не подключён к кабинету.",
    );
    return NextResponse.json({ ok: true });
  }

  await reply(
    chatId,
    `Это бот уведомлений партнёрского кабинета MMB RUSSIA. Чтобы получать уведомления, откройте профиль в <a href="${cabinetUrl("/")}">кабинете</a> и нажмите «Подключить Telegram».`,
  );
  return NextResponse.json({ ok: true });
});
