import { NextResponse } from "next/server";
import { handleAtolCallback } from "@/lib/payments/service";

export const runtime = "nodejs";

/**
 * POST-колбэк АТОЛ Онлайн: приходит после обработки чека
 * и содержит фискальные реквизиты либо причину отказа.
 */
export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const updated = await handleAtolCallback(payload as Record<string, unknown>);
  if (!updated) {
    // Отвечаем 200: неизвестный uuid не должен заставлять АТОЛ повторять доставку.
    return NextResponse.json({ ok: true, matched: false });
  }
  return NextResponse.json({ ok: true, matched: true });
}
