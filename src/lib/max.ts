import "server-only";

import { readFileSync } from "node:fs";
import { request } from "node:https";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { timingSafeEqual } from "node:crypto";
import { cabinetUrl } from "./cabinet-origin";

/**
 * Бот уведомлений в мессенджере MAX (Bot API, platform-api2.max.ru).
 * Токен бота — MAX_BOT_TOKEN, секрет вебхука — MAX_WEBHOOK_SECRET: оба
 * только в .env на сервере. Ник бота для ссылки привязки берётся из /me,
 * MAX_BOT_USERNAME нужен, только если /me временно не отвечает.
 */
const API_BASE = "https://platform-api2.max.ru";
const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_WEBHOOK_PATH = "/api/max/webhook";

function token(): string | null {
  return process.env.MAX_BOT_TOKEN?.trim() || null;
}

function webhookSecret(): string | null {
  return process.env.MAX_WEBHOOK_SECRET?.trim() || null;
}

export function isMaxConfigured(): boolean {
  return Boolean(token() && webhookSecret());
}

// Сертификат API MAX выпущен НУЦ Минцифры, которого нет в стандартном наборе Node.
let caCache: string[] | null = null;
function trustedCa(): string[] {
  if (caCache) return caCache;
  const file = process.env.MAX_CA_FILE?.trim() || join(process.cwd(), "certs", "russian-trusted-root-ca.crt");
  try {
    caCache = [...rootCertificates, readFileSync(file, "utf8")];
  } catch (err) {
    console.error("[max] не найден корневой сертификат Минцифры", file, err);
    caCache = [...rootCertificates];
  }
  return caCache;
}

type Query = Record<string, string | number | boolean | undefined>;

export class MaxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Вызов Bot API MAX. Ошибку API превращает в MaxApiError с текстом от MAX. */
export function maxApi<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { query?: Query; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const key = token();
  if (!key) return Promise.reject(new Error("MAX не настроен: нет MAX_BOT_TOKEN"));
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const payload = opts.body === undefined ? null : Buffer.from(JSON.stringify(opts.body));

  return new Promise<T>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        ca: trustedCa(),
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        headers: {
          Authorization: key,
          Accept: "application/json",
          ...(payload && { "Content-Type": "application/json", "Content-Length": payload.length }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          const status = res.statusCode ?? 0;
          const body = (json ?? {}) as { message?: string; code?: string; success?: boolean };
          if (status < 200 || status >= 300 || body.success === false) {
            const reason = body.message || body.code || text.slice(0, 200) || `HTTP ${status}`;
            reject(new MaxApiError(`MAX ответил ${status}: ${reason}`, status));
            return;
          }
          resolve(json as T);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("MAX не ответил вовремя")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

type MaxMe = { user_id?: number; name?: string; username?: string | null };
type MaxSubscription = { url?: string; time?: number; update_types?: string[] | null };

let botCache: { username: string; at: number } | null = null;

export type MaxStatus = {
  bot: string | null;
  botName: string | null;
  webhookUrl: string | null;
  /** Подписка смотрит на этот кабинет. */
  webhookOk: boolean;
  error: string | null;
};

export function maxWebhookUrl(): string {
  return cabinetUrl(MAX_WEBHOOK_PATH);
}

/** Состояние бота для настроек: ник, куда смотрит вебхук. */
export async function getMaxStatus(): Promise<MaxStatus> {
  try {
    const [me, subs] = await Promise.all([
      maxApi<MaxMe>("GET", "/me", { timeoutMs: 6_000 }),
      maxApi<{ subscriptions?: MaxSubscription[] }>("GET", "/subscriptions", { timeoutMs: 6_000 }),
    ]);
    if (me.username) botCache = { username: me.username, at: Date.now() };
    const urls = (subs.subscriptions ?? []).map((s) => s.url).filter((u): u is string => Boolean(u));
    const expected = maxWebhookUrl();
    return {
      bot: me.username ?? null,
      botName: me.name ?? null,
      webhookUrl: urls.find((u) => u === expected) ?? urls[0] ?? null,
      webhookOk: urls.includes(expected),
      error: null,
    };
  } catch (err) {
    return {
      bot: null,
      botName: null,
      webhookUrl: null,
      webhookOk: false,
      error: err instanceof Error ? err.message : "MAX не ответил",
    };
  }
}

/** Подписывает бота на события кабинета: запуск по ссылке привязки и сообщения. */
export async function setupMaxWebhook(): Promise<void> {
  const secret = webhookSecret();
  if (!secret || !/^[A-Za-z0-9_-]{5,256}$/.test(secret)) {
    throw new Error("MAX_WEBHOOK_SECRET — от 5 до 256 латинских букв, цифр, «_» или «-»");
  }
  await maxApi("POST", "/subscriptions", {
    body: {
      url: maxWebhookUrl(),
      update_types: ["bot_started", "bot_stopped", "message_created"],
      secret,
    },
  });
}

/** Ник бота для ссылки привязки max.ru/<бот>?start=<код>. */
export async function getMaxBotUsername(): Promise<string | null> {
  if (botCache && Date.now() - botCache.at < 60 * 60_000) return botCache.username;
  try {
    const me = await maxApi<MaxMe>("GET", "/me", { timeoutMs: 6_000 });
    if (me.username) {
      botCache = { username: me.username, at: Date.now() };
      return me.username;
    }
  } catch (err) {
    console.error("[max] /me не ответил", err);
  }
  return process.env.MAX_BOT_USERNAME?.trim().replace(/^@/, "") || null;
}

/** Вебхук подписан секретом из POST /subscriptions. */
export function isMaxWebhookRequest(req: Request): boolean {
  const secret = webhookSecret();
  const got = req.headers.get("x-max-bot-api-secret");
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function escapeMaxHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Личное сообщение пользователю MAX. Текст — HTML; ссылка уходит кнопкой. */
export async function sendMaxMessage(opts: {
  maxUserId: string;
  text: string;
  button?: { text: string; url: string } | null;
}): Promise<void> {
  // Кнопки-ссылки MAX принимает только с https.
  const button = opts.button && /^https:\/\//i.test(opts.button.url) ? opts.button : null;
  await maxApi("POST", "/messages", {
    query: { user_id: opts.maxUserId, disable_link_preview: true },
    body: {
      text: opts.text.slice(0, 4000),
      format: "html",
      ...(button && {
        attachments: [
          { type: "inline_keyboard", payload: { buttons: [[{ type: "link", text: button.text, url: button.url }]] } },
        ],
      }),
    },
  });
}
