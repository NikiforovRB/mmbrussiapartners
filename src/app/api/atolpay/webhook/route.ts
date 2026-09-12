import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { atolPayWebhookSecret, handleAtolPayCallback } from "@/lib/payments/service";

export const runtime = "nodejs";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST-колбэк АТОЛ Pay (эквайринг): приходит при смене статуса оплаты.
 * Адрес передаётся в additionalProps.notificationUrl при регистрации платежа.
 * Подлинность подтверждает неугадываемый токен в адресе.
 */
export async function POST(req: Request) {
  const expected = atolPayWebhookSecret();
  if (!expected) {
    return NextResponse.json(
      { error: "Колбэк не настроен (ATOL_PAY_WEBHOOK_SECRET)", code: "NOT_CONFIGURED" },
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

  const updated = await handleAtolPayCallback(payload as Record<string, unknown>);
  // Отвечаем 200 и на неизвестный orderId — иначе АТОЛ Pay будет повторять доставку.
  return NextResponse.json({ ok: true, matched: Boolean(updated) });
}
