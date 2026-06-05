import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { atol } from "@/lib/payments/atol";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const result = await atol.handleWebhook(payload);
  if (!result) return NextResponse.json({ ok: false }, { status: 400 });

  await db.payment.update({
    where: { id: result.paymentId },
    data: {
      status: result.status,
      providerPayload: payload,
    },
  });
  return NextResponse.json({ ok: true });
}
