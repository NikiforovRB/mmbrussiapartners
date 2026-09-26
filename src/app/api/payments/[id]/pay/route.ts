import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { atolPayCheckoutUrl, siteOrigin } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Переход к онлайн-оплате счёта: ведёт на действующую ссылку АТОЛ Pay или
 * перевыпускает просроченную. Оплаченный или закрытый счёт возвращает на его
 * страницу.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = siteOrigin();
  const page = `${origin}/dealer/payments/${id}`;

  const session = await auth();
  if (!session?.user) return NextResponse.redirect(`${origin}/login`);
  if (session.user.status !== "APPROVED") return NextResponse.redirect(`${origin}/dealer`);

  // Каждый перевыпуск ссылки — новый заказ в АТОЛ Pay.
  const rl = await rateLimit(`payment-checkout:${session.user.id}:${clientIp(req.headers)}`, {
    limit: 30,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) return NextResponse.redirect(`${page}?checkout=failed`);

  const payment = await db.payment.findUnique({
    where: { id },
    select: { dealerId: true, provider: true },
  });
  if (!payment || payment.dealerId !== session.user.id) {
    return NextResponse.redirect(`${origin}/dealer/payments`);
  }
  if (payment.provider !== "atol_pay") return NextResponse.redirect(page);

  try {
    const url = await atolPayCheckoutUrl(id);
    return NextResponse.redirect(url ?? page);
  } catch (err) {
    console.error(`[payments] не удалось выдать ссылку на оплату ${id}`, err);
    return NextResponse.redirect(`${page}?checkout=failed`);
  }
}
