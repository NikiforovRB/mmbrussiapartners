import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { atolWebhookSecret, handleAtolCallback } from "@/lib/payments/service";

export const runtime = "nodejs";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST-колбэк АТОЛ Онлайн: приходит после обработки чека
 * и содержит фискальные реквизиты либо причину отказа.
 *
 * Подписи у колбэка нет, поэтому подлинность подтверждает токен в адресе —
 * тот самый, что был передан кассе в callback_url.
 */
export async function POST(req: Request) {
  const expected = atolWebhookSecret();
  if (!expected) {
    return NextResponse.json(
      { error: "Колбэк не настроен (ATOL_WEBHOOK_SECRET)", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!tokenMatches(token, expected)) {
    return NextResponse.json({ error: "Недействительный токен", code: "FORBIDDEN" }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Некорректное тело", code: "VALIDATION" }, { status: 400 });
  }

  const updated = await handleAtolCallback(payload as Record<string, unknown>);
  // Отвечаем 200 и на неизвестный uuid: иначе АТОЛ будет повторять доставку.
  return NextResponse.json({ ok: true, matched: Boolean(updated) });
}
