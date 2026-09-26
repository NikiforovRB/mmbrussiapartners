import "server-only";
import { db } from "./db";

/**
 * Лимитер по «фиксированному окну». Счётчики лежат в Postgres (RateLimitBucket):
 * переживают деплой и рестарт и общие для всех инстансов приложения. Время
 * окна считает база, чтобы расхождение часов между машинами не влияло.
 *
 * Если база недоступна, считаем в памяти процесса: защита слабее, но запрос не
 * падает из-за лимитера.
 */

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

type RateLimitOptions = { limit: number; windowMs: number };

/** Доля вызовов, после которых чистим истёкшие окна. */
const CLEANUP_PROBABILITY = 0.005;

export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const rows = await db.$queryRaw<{ count: number; retryAfterMs: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${opts.windowMs}::integer * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1
                       ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN EXCLUDED."resetAt"
                         ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count",
        GREATEST(0, EXTRACT(EPOCH FROM ("resetAt" - now())) * 1000)::float8 AS "retryAfterMs"`;
    if (Math.random() < CLEANUP_PROBABILITY) {
      void db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 hour'`.catch(
        () => {},
      );
    }
    const row = rows[0];
    if (!row) return memoryRateLimit(key, opts);
    const count = Number(row.count);
    if (count > opts.limit) {
      return { ok: false, remaining: 0, retryAfterMs: Math.ceil(Number(row.retryAfterMs)) };
    }
    return { ok: true, remaining: opts.limit - count, retryAfterMs: 0 };
  } catch (err) {
    console.error("[rate-limit] база недоступна, считаем в памяти", err);
    return memoryRateLimit(key, opts);
  }
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000;

/** Счётчик только в памяти процесса — для проверок, которые не должны зависеть от базы. */
export function memoryRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Ленивая уборка: не даём карте разрастаться из-за разовых ключей.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true, remaining: opts.limit - bucket.count, retryAfterMs: 0 };
}

/**
 * IP клиента. Приложение слушает только 127.0.0.1 за nginx, а nginx
 * перезаписывает X-Real-IP адресом соединения. X-Forwarded-For клиент может
 * прислать сам (nginx лишь дописывает к нему адрес), поэтому из него берём
 * только последний хоп — его добавил наш прокси.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops[hops.length - 1] || "unknown";
}
