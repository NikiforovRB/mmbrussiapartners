/**
 * Cloudflare Worker — прокси Telegram Bot API для партнёрского кабинета MMB RUSSIA
 * (mmbpartners.<аккаунт>.workers.dev). С сервера кабинета api.telegram.org
 * недоступен, поэтому кабинет ходит в Telegram через этот воркер, а обновления
 * бота (/start с кодом привязки) воркер пересылает в кабинет.
 *
 * Переменные воркера (Workers & Pages → воркер → Settings → Variables and Secrets):
 *   TELEGRAM_BOT_TOKEN   Secret  токен бота от @BotFather
 *   PROXY_SECRET         Secret  тот же, что TELEGRAM_PROXY_SECRET в .env кабинета
 *   WEBHOOK_SECRET       Secret  любая случайная строка из A–Z, a–z, 0–9, _ и - (до 256 символов)
 *   CABINET_WEBHOOK_URL  Text    https://cabinet.mmbrussia.ru/api/telegram/webhook
 *
 * Маршруты:
 *   POST /bot/<метод>  из кабинета, заголовок X-Proxy-Secret; методы — ALLOWED_METHODS
 *   POST /setup        из кабинета: ставит вебхук бота на этот воркер
 *   POST /webhook      от Telegram, заголовок X-Telegram-Bot-Api-Secret-Token
 */
const ALLOWED_METHODS = new Set(["getMe", "sendMessage", "getWebhookInfo"]);

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return json({ ok: false, description: "Not found" }, 404);
    const url = new URL(request.url);

    if (url.pathname === "/webhook") {
      const token = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (!env.WEBHOOK_SECRET || !safeEqual(token, env.WEBHOOK_SECRET)) return json({ ok: false }, 401);
      const body = await request.text();
      // Telegram ждёт быстрый ответ; кабинет получает обновление в фоне.
      ctx.waitUntil(
        fetch(env.CABINET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Proxy-Secret": env.PROXY_SECRET },
          body,
        }).catch(() => {}),
      );
      return json({ ok: true });
    }

    const secret = request.headers.get("X-Proxy-Secret") || "";
    if (!env.PROXY_SECRET || !safeEqual(secret, env.PROXY_SECRET)) {
      return json({ ok: false, description: "Unauthorized" }, 401);
    }

    if (url.pathname === "/setup") {
      const webhook = `${url.origin}/webhook`;
      const res = await callTelegram(env, "setWebhook", {
        url: webhook,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      });
      return res.data.ok ? json({ ok: true, result: { webhook } }) : json(res.data, res.status);
    }

    const match = url.pathname.match(/^\/bot\/([A-Za-z]+)$/);
    if (match && ALLOWED_METHODS.has(match[1])) {
      const payload = await request.json().catch(() => ({}));
      const res = await callTelegram(env, match[1], payload);
      return json(res.data, res.status);
    }

    return json({ ok: false, description: "Not found" }, 404);
  },
};

async function callTelegram(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `Telegram ответил ${res.status}` }));
  return { status: res.status, data };
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
