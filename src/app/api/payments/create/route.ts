import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPayment } from "@/lib/payments/service";
import { defaultLicensePrice, getPaymentProvider } from "@/lib/payments/provider";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().max(200).optional(),
  licenseId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const amount = parsed.data.amount ?? defaultLicensePrice();
  if (!amount) {
    return NextResponse.json(
      { error: "Не задана стоимость. Укажите сумму или переменную PAYMENT_LICENSE_PRICE." },
      { status: 400 },
    );
  }

  const profile = await db.dealerProfile.findUnique({ where: { userId: session.user.id } });

  try {
    const payment = await createPayment({
      dealerId: session.user.id,
      amount,
      description: parsed.data.description ?? "Генерация лицензии MMB RUSSIA",
      licenseId: parsed.data.licenseId ?? null,
      email: session.user.email,
      phone: profile?.phone ?? null,
    });

    return NextResponse.json({
      paymentId: payment.id,
      payUrl: payment.payUrl,
      provider: payment.provider,
      manual: getPaymentProvider().id === "manual",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
