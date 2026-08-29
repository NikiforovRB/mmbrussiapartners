import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { fiscalizePayment, markPaymentPaid, refreshReceipt } from "@/lib/payments/service";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["confirm", "cancel", "fiscalize", "refresh-receipt"]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const canManage = hasPermission(session.user.permissions, "payments.manage", session.user.isSuperAdmin);
  if (!canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const payment = await db.payment.findUnique({ where: { id } });
  if (!payment) return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });

  try {
    switch (parsed.data.action) {
      case "confirm": {
        const updated = await markPaymentPaid(id, session.user.id);
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "cancel": {
        if (payment.status === "PAID") {
          return NextResponse.json({ error: "Оплаченный платёж нельзя отменить" }, { status: 400 });
        }
        const updated = await db.payment.update({ where: { id }, data: { status: "CANCELLED" } });
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "fiscalize": {
        const updated = await fiscalizePayment(id);
        return NextResponse.json({ ok: true, payment: updated });
      }
      case "refresh-receipt": {
        const updated = await refreshReceipt(id);
        return NextResponse.json({ ok: true, payment: updated });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
