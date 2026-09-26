import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health-check для платформы: проверяет только то, что процесс поднялся и
 * отвечает. База сюда не подмешивается специально — иначе её недоступность
 * перезапускала бы контейнер, и кабинет вообще перестал бы открываться.
 * Базу и хранилище для внешнего мониторинга проверяет /api/health/deep.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
