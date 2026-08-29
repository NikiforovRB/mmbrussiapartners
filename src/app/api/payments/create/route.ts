import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ApiError, badRequest, forbidden, parseBody, route, unauthenticated } from "@/lib/api";
import { createPayment } from "@/lib/payments/service";
import { getPaymentProvider, licensePrice } from "@/lib/payments/provider";
import { notifyAdmins } from "@/lib/app-notifications";

export const runtime = "nodejs";

const schema = z.object({
  /** Произвольную сумму задаёт только администратор с payments.manage. */
  amount: z.number().positive().max(10_000_000).optional(),
  description: z.string().max(200).optional(),
  licenseId: z.string().optional(),
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (session.user.status !== "APPROVED") throw forbidden("Аккаунт не одобрен");

  const body = await parseBody(req, schema);
  const canSetAmount = hasPermission(
    session.user.permissions,
    "payments.manage",
    session.user.isSuperAdmin,
  );

  let licenseId: string | null = null;
  let bundle: string | null = null;
  if (body.licenseId) {
    const license = await db.license.findUnique({
      where: { id: body.licenseId },
      select: {
        id: true,
        number: true,
        dealerId: true,
        bundle: true,
        payment: { select: { id: true } },
      },
    });
    if (!license) throw badRequest("Лицензия не найдена");
    if (license.dealerId !== session.user.id && !canSetAmount) {
      throw forbidden("Лицензия принадлежит другому представителю");
    }
    if (license.payment) throw badRequest("По этой лицензии счёт уже выставлен");
    licenseId = license.id;
    bundle = license.bundle;
  }

  // Сумму берём из прайса на сервере по комплектации лицензии. Клиентское
  // значение принимается только от администратора — иначе счёт можно было бы
  // выставить себе на рубль.
  const amount = canSetAmount && body.amount ? body.amount : licensePrice(bundle);
  if (!amount) {
    throw badRequest("Не задана стоимость. Укажите переменную PAYMENT_LICENSE_PRICE.");
  }

  const profile = await db.dealerProfile.findUnique({ where: { userId: session.user.id } });

  let payment;
  try {
    payment = await createPayment({
      dealerId: session.user.id,
      amount,
      description: body.description ?? "Генерация лицензии MMB RUSSIA",
      licenseId,
      email: session.user.email,
      phone: profile?.phone ?? null,
    });
  } catch (e) {
    throw new ApiError("UPSTREAM", (e as Error).message);
  }

  await notifyAdmins(["payments.manage"], {
    type: "PAYMENT_CREATED",
    title: `Новый счёт на ${amount.toLocaleString("ru-RU")} ₽`,
    body: session.user.email,
    link: "/admin/payments",
  });

  return NextResponse.json({
    paymentId: payment.id,
    payUrl: payment.payUrl,
    provider: payment.provider,
    manual: getPaymentProvider().id === "manual",
  });
});
