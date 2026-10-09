import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, parseBody, route } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { cabinetUrl } from "@/lib/cabinet-origin";
import {
  isSmtpConfigured,
  notificationEmailHtml,
  notificationTelegramText,
  sendEmail,
  sendMax,
  sendTelegram,
} from "@/lib/notifications";
import { isTelegramConfigured } from "@/lib/telegram";
import { isMaxConfigured } from "@/lib/max";

export const runtime = "nodejs";

const schema = z.object({ channel: z.enum(["email", "telegram", "max"]) });

/** Проверка канала: письмо или сообщение самому администратору. */
export const POST = route(
  async (req: Request) => {
    const session = await requirePermission("settings.edit");
    const { channel } = await parseBody(req, schema);
    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, telegramChatId: true, maxUserId: true },
    });
    if (!me) throw badRequest("Пользователь не найден");

    const message = {
      title: "Проверка уведомлений MMB RUSSIA",
      body: "Канал работает: сюда будут приходить уведомления партнёрского кабинета.",
      url: cabinetUrl("/admin/settings"),
    };

    if (channel === "email") {
      if (!isSmtpConfigured()) throw badRequest("Почта не настроена: задайте SMTP_HOST, SMTP_USER и SMTP_PASS на сервере");
      const res = await sendEmail({
        to: me.email,
        subject: message.title,
        html: notificationEmailHtml({ ...message, footer: "Тестовое письмо из раздела «Настройки → Уведомления»." }),
        text: `${message.title}\n\n${message.body}`,
        userId: me.id,
      });
      if (!res.ok) throw badRequest(`Письмо не ушло: ${res.reason}`);
      return NextResponse.json({ ok: true, to: me.email });
    }

    if (channel === "max") {
      if (!isMaxConfigured()) {
        throw badRequest("MAX не настроен: задайте MAX_BOT_TOKEN и MAX_WEBHOOK_SECRET на сервере");
      }
      if (!me.maxUserId) throw badRequest("Сначала подключите MAX в своём профиле");
      const res = await sendMax({ maxUserId: me.maxUserId, ...message, userId: me.id });
      if (!res.ok) throw badRequest(`Сообщение не ушло: ${res.reason}`);
      return NextResponse.json({ ok: true });
    }

    if (!isTelegramConfigured()) {
      throw badRequest("Telegram не настроен: задайте TELEGRAM_PROXY_URL и TELEGRAM_PROXY_SECRET на сервере");
    }
    if (!me.telegramChatId) throw badRequest("Сначала подключите Telegram в своём профиле");
    const res = await sendTelegram({ chatId: me.telegramChatId, text: notificationTelegramText(message), userId: me.id });
    if (!res.ok) throw badRequest(`Сообщение не ушло: ${res.reason}`);
    return NextResponse.json({ ok: true });
  },
  { rateLimit: { limit: 10, windowMs: 10 * 60_000, name: "notifications-test" } },
);
