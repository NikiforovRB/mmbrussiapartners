import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { cabinetUrl } from "@/lib/cabinet-origin";
import { escapeMaxHtml, isMaxWebhookRequest, sendMaxMessage } from "@/lib/max";

export const runtime = "nodejs";

type MaxUser = {
  user_id?: number;
  name?: string;
  first_name?: string;
  last_name?: string | null;
  username?: string | null;
  is_bot?: boolean;
};

type Update = {
  update_type?: string;
  user?: MaxUser;
  payload?: string | null;
  message?: {
    sender?: MaxUser;
    recipient?: { chat_type?: string };
    body?: { text?: string | null };
  };
};

async function reply(maxUserId: string, text: string) {
  await sendMaxMessage({ maxUserId, text }).catch((err) => console.error("[max] ответ боту не ушёл", err));
}

function displayName(user: MaxUser): string | null {
  if (user.username) return `@${user.username}`;
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
}

async function link(maxUserId: string, user: MaxUser, code: string) {
  const owner = await db.user.findUnique({
    where: { maxLinkCode: code.slice(0, 64) },
    select: { id: true, email: true, maxLinkCodeExpiresAt: true },
  });
  if (!owner || !owner.maxLinkCodeExpiresAt || owner.maxLinkCodeExpiresAt < new Date()) {
    await reply(
      maxUserId,
      "Ссылка устарела или уже использована. Откройте профиль в кабинете MMB RUSSIA и нажмите «Подключить MAX» ещё раз.",
    );
    return;
  }
  await db.user.update({
    where: { id: owner.id },
    data: {
      maxUserId,
      maxName: displayName(user)?.slice(0, 100) ?? null,
      maxLinkedAt: new Date(),
      notifyByMax: true,
      maxLinkCode: null,
      maxLinkCodeExpiresAt: null,
    },
  });
  await reply(
    maxUserId,
    `Готово: уведомления кабинета MMB RUSSIA для <b>${escapeMaxHtml(owner.email)}</b> будут приходить сюда.\n\nОтключить — команда /stop или переключатель в профиле кабинета.`,
  );
}

async function unlink(maxUserId: string) {
  const { count } = await db.user.updateMany({
    where: { maxUserId },
    data: { maxUserId: null, maxName: null, maxLinkedAt: null, notifyByMax: false },
  });
  return count;
}

/**
 * События бота MAX (подписка POST /subscriptions с секретом). Бот понимает
 * запуск по ссылке max.ru/<бот>?start=<код> из профиля, «/start <код>»
 * и «/stop» — отключить уведомления в этом диалоге.
 */
export const POST = route(async (req: Request) => {
  if (!isMaxWebhookRequest(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update = (await req.json().catch(() => ({}))) as Update;

  if (update.update_type === "bot_started" && update.user?.user_id && !update.user.is_bot) {
    const maxUserId = String(update.user.user_id);
    const code = update.payload?.trim();
    if (code) await link(maxUserId, update.user, code);
    else {
      await reply(
        maxUserId,
        `Это бот уведомлений партнёрского кабинета MMB RUSSIA. Чтобы получать уведомления, откройте профиль в <a href="${escapeMaxHtml(cabinetUrl("/"))}">кабинете</a> и нажмите «Подключить MAX».`,
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (update.update_type === "bot_stopped" && update.user?.user_id) {
    await unlink(String(update.user.user_id));
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const sender = msg?.sender;
  if (update.update_type !== "message_created" || !sender?.user_id || sender.is_bot) {
    return NextResponse.json({ ok: true });
  }
  if (msg?.recipient?.chat_type && msg.recipient.chat_type !== "dialog") return NextResponse.json({ ok: true });
  const maxUserId = String(sender.user_id);
  const [command, arg] = (msg?.body?.text ?? "").trim().split(/\s+/, 2);

  if (command === "/start" && arg) {
    await link(maxUserId, sender, arg);
    return NextResponse.json({ ok: true });
  }
  if (command === "/stop") {
    const count = await unlink(maxUserId);
    await reply(
      maxUserId,
      count > 0 ? "Уведомления отключены. Подключить снова можно в профиле кабинета." : "Этот диалог не подключён к кабинету.",
    );
    return NextResponse.json({ ok: true });
  }

  await reply(
    maxUserId,
    `Это бот уведомлений партнёрского кабинета MMB RUSSIA. Чтобы получать уведомления, откройте профиль в <a href="${escapeMaxHtml(cabinetUrl("/"))}">кабинете</a> и нажмите «Подключить MAX». Отключить — /stop.`,
  );
  return NextResponse.json({ ok: true });
});
