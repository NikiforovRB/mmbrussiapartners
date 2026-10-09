import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentSettingsSchema } from "@/lib/site-settings";
import { badRequest, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { atolPayPaymentMethods } from "@/lib/payments/provider";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

/** Настройки онлайн-оплаты (наименование услуги, НДС, способ расчёта). */
export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");

  const parsed = paymentSettingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest(parsed.error.errors[0]?.message ?? "Некорректные данные");

  // Выбирать можно только из подключённых на сервере; выбраны все — храним пусто.
  const connected = [...new Set(atolPayPaymentMethods().map((m) => m.paymentType))];
  const chosen = [...new Set(parsed.data.checkoutTypes)].filter((t) => connected.includes(t));
  if (connected.length > 0 && parsed.data.checkoutTypes.length > 0 && chosen.length === 0) {
    throw badRequest("Оставьте хотя бы один способ оплаты");
  }
  const payment = {
    serviceLabel: parsed.data.serviceLabel.trim(),
    vatType: parsed.data.vatType,
    paymentMethod: parsed.data.paymentMethod,
    checkoutTypes: chosen.length === connected.length ? [] : chosen,
    merchantName: parsed.data.merchantName,
  };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { payment },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      payment,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "payment",
    action: "UPDATED",
    summary: "Настройки онлайн-оплаты",
  });

  return NextResponse.json({ ok: true });
});
