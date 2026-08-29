import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { forbidden, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction, changedFields } from "@/lib/admin-audit";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().min(3, "Укажите телефон"),
  email: z.string().email("Некорректный email"),
  address: z.string().nullable().optional(),
});

export const PATCH = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const data = await parseBody(req, schema);
  const before = await db.companySettings.findUnique({ where: { id: "singleton" } });
  const next = { phone: data.phone, email: data.email, address: data.address ?? null };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: next,
    create: { id: "singleton", ...next, publicPhones: [] },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: "company",
    action: "UPDATED",
    summary: "Контакты компании",
    diff: before ? changedFields(before, next) : { ...next },
  });

  return NextResponse.json({ ok: true });
});
