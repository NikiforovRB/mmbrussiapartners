import "server-only";

import { timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "./http";

/**
 * Telegram Bot API идёт через Cloudflare Worker (deploy/telegram-worker.js):
 * api.telegram.org с сервера в РФ недоступен. Токен бота хранится только в
 * воркере, сервер знает лишь общий секрет TELEGRAM_PROXY_SECRET — им же
 * воркер подписывает входящие обновления (/start с кодом привязки).
 */
function proxyBase(): string | null {
  const url = process.env.TELEGRAM_PROXY_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

function proxySecret(): string | null {
  return process.env.TELEGRAM_PROXY_SECRET?.trim() || null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(proxyBase() && proxySecret());
}

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

async function callProxy<T>(path: string, payload: unknown, timeoutMs?: number): Promise<T> {
  const base = proxyBase();
  const secret = proxySecret();
  if (!base || !secret) throw new Error("Telegram не настроен: нет TELEGRAM_PROXY_URL или TELEGRAM_PROXY_SECRET");
  const res = await fetchWithTimeout(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": secret },
    body: JSON.stringify(payload ?? {}),
    timeoutMs,
  });
  const json = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
  if (!json) {
    throw new Error(`Воркер ответил не JSON (${res.status}) — проверьте, что в нём код deploy/telegram-worker.js`);
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.description ?? `Прокси Telegram ответил ${res.status}`);
  }
  return json.result as T;
}

/** Метод Bot API через воркер: sendMessage, getMe, getWebhookInfo. */
export function telegramApi<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<T> {
  return callProxy<T>(`/bot/${method}`, payload, timeoutMs);
}

let botCache: { username: string; at: number } | null = null;

export type TelegramStatus = {
  bot: string | null;
  webhookUrl: string | null;
  pending: number;
  lastError: string | null;
  error: string | null;
};

/** Состояние бота для настроек: имя, куда смотрит вебхук, последняя ошибка доставки. */
export async function getTelegramStatus(): Promise<TelegramStatus> {
  try {
    const [me, hook] = await Promise.all([
      telegramApi<{ username?: string }>("getMe", {}, 6_000),
      telegramApi<{ url?: string; pending_update_count?: number; last_error_message?: string }>(
        "getWebhookInfo",
        {},
        6_000,
      ),
    ]);
    if (me.username) botCache = { username: me.username, at: Date.now() };
    return {
      bot: me.username ?? null,
      webhookUrl: hook.url || null,
      pending: hook.pending_update_count ?? 0,
      lastError: hook.last_error_message ?? null,
      error: null,
    };
  } catch (err) {
    return {
      bot: null,
      webhookUrl: null,
      pending: 0,
      lastError: null,
      error: err instanceof Error ? err.message : "Воркер не ответил",
    };
  }
}

/** Воркер ставит вебхук бота на себя — с секретом, который знает только он. */
export function setupTelegramWebhook(): Promise<{ webhook: string }> {
  return callProxy<{ webhook: string }>("/setup", {});
}

/** @username бота для ссылки привязки t.me/<бот>?start=<код>. */
export async function getBotUsername(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (fromEnv) return fromEnv;
  if (botCache && Date.now() - botCache.at < 60 * 60_000) return botCache.username;
  try {
    const me = await telegramApi<{ username?: string }>("getMe");
    if (!me.username) return null;
    botCache = { username: me.username, at: Date.now() };
    return me.username;
  } catch (err) {
    console.error("[telegram] getMe не ответил", err);
    return null;
  }
}

/** Запрос от воркера подписан общим секретом. */
export function isProxyRequest(req: Request): boolean {
  const secret = proxySecret();
  const got = req.headers.get("x-proxy-secret");
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function escapeTelegramHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
