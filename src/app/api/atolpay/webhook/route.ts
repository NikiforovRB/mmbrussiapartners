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
 * Подлинность подтверждает неугадываемый токен в адресе, а саму оплату —
 * запрос статуса заказа в АТОЛ Pay.
 */
export async function POST(req: Request) {
  const expected = atolPayWebhookSecret();
  if (!expected) {
    return NextResponse.json(
      { error: "Колбэк не настроен (ATOL_PAY_WEBHOOK_SECRET)", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const params = new URL(req.url).searchParams;
  const token = params.get("token") ?? "";
  if (!tokenMatches(token, expected)) {
    return NextResponse.json({ error: "Недействительный токен", code: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const synced = await handleAtolPayCallback(payload, params.get("orderId"));
    // Отвечаем 200 и на неизвестный orderId — иначе АТОЛ Pay будет повторять доставку.
    return NextResponse.json({ ok: true, matched: Boolean(synced), paid: synced?.paid ?? false });
  } catch (err) {
    // Статус заказа не получен — 5xx, чтобы АТОЛ Pay повторил колбэк позже.
    console.error("[atolpay] не удалось сверить оплату по колбэку", err);
    return NextResponse.json({ error: "Сверка оплаты не удалась", code: "UPSTREAM" }, { status: 502 });
  }
}
