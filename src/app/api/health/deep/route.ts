import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { pingBucket } from "@/lib/s3";
import { clientIp, memoryRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 5_000;

type CheckResult = { ok: boolean; ms: number; error?: string };

async function runCheck(fn: () => Promise<unknown>): Promise<CheckResult> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`нет ответа за ${CHECK_TIMEOUT_MS} мс`)), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: (err as Error).message.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

function tokenMatches(req: Request, expected: string): boolean {
  const url = new URL(req.url);
  const header = req.headers.get("authorization")?.replace(/^bearer\s+/i, "");
  const got = Buffer.from(url.searchParams.get("token") ?? header ?? "");
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Глубокая проверка для внешнего мониторинга: база и объектное хранилище.
 * systemd и деплой смотрят на /api/health — недоступность базы не должна
 * перезапускать процесс, поэтому эти проверки живут отдельно. 503 — одна из
 * зависимостей не отвечает.
 *
 * С HEALTH_CHECK_TOKEN ответ содержит тексты ошибок и требует ?token=… или
 * Authorization: Bearer; без токена отдаются только признаки ok.
 */
export async function GET(req: Request) {
  const token = process.env.HEALTH_CHECK_TOKEN;
  if (token && !tokenMatches(req, token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rl = memoryRateLimit(`health-deep:${clientIp(req.headers)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const [database, storage] = await Promise.all([
    runCheck(() => db.$queryRaw`SELECT 1`),
    runCheck(() => pingBucket(CHECK_TIMEOUT_MS)),
  ]);
  const checks = { database, storage };
  const ok = Object.values(checks).every((c) => c.ok);
  const body = token
    ? checks
    : Object.fromEntries(Object.entries(checks).map(([name, c]) => [name, { ok: c.ok, ms: c.ms }]));

  return NextResponse.json(
    { ok, at: new Date().toISOString(), checks: body },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
