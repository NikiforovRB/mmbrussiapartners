import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentSettingsSchema } from "@/lib/site-settings";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

/** Настройки онлайн-оплаты (наименование услуги, НДС, способ расчёта). */
export const PATCH = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const parsed = paymentSettingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest(parsed.error.errors[0]?.message ?? "Некорректные данные");

  const payment = {
    serviceLabel: parsed.data.serviceLabel.trim(),
    vatType: parsed.data.vatType,
    paymentMethod: parsed.data.paymentMethod,
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
