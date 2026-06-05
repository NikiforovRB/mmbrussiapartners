import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { atol } from "@/lib/payments/atol";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
  licenseId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const payment = await db.payment.create({
    data: {
      dealerId: session.user.id,
      amount: parsed.data.amount,
      currency: "RUB",
      status: "PENDING",
      description: parsed.data.description ?? null,
      licenseId: parsed.data.licenseId,
    },
  });

  const result = await atol.createPayment({
    paymentId: payment.id,
    amount: parsed.data.amount,
    description: parsed.data.description ?? "Лицензия MMB RUSSIA",
    email: session.user.email,
    returnUrl: `${process.env.NEXTAUTH_URL ?? ""}/dealer/payments`,
  });

  await db.payment.update({
    where: { id: payment.id },
    data: { externalId: result.externalId },
  });

  return NextResponse.json({ payUrl: result.payUrl, paymentId: payment.id });
}
