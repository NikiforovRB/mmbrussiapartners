import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { syncLicenseSlots } from "@/lib/license-slots";

export const runtime = "nodejs";

const patchSchema = z.object({
  type: z.enum(["Генерация", "Обновление", "Восстановление"]).optional(),
  features: z.record(z.union([z.boolean(), z.string()])).optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED", "REVOKED", "DRAFT"]).optional(),
});

/**
 * Условия лицензии меняет только администратор с licenses.manageTerms:
 * право licenses.edit есть и у представителя, и одного его мало.
 */
const TERM_FIELDS = ["status", "features", "type"] as const;

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) throw notFound("Лицензия не найдена");

  // Чужую лицензию правит только администратор: licenses.edit есть и у
  // представителя, поэтому одного этого права для доступа недостаточно.
  const isOwner = license.dealerId === session.user.id;
  const isAdmin = hasAdminScope(session.user.permissions, session.user.isSuperAdmin);
  const canEdit = hasPermission(
    session.user.permissions,
    "licenses.edit",
    session.user.isSuperAdmin,
  );
  const canManageTerms = hasPermission(
    session.user.permissions,
    "licenses.manageTerms",
    session.user.isSuperAdmin,
  );
  if (!isOwner && !(isAdmin && canEdit)) throw forbidden();

  const data = await parseBody(req, patchSchema);

  if (!canManageTerms) {
    const attempted = TERM_FIELDS.filter((f) => data[f] !== undefined);
    if (attempted.length > 0) {
      throw forbidden("Статус, срок, тип и набор функций лицензии меняет администратор");
    }
  }

  const before = license;
  const updated = await db.license.update({
    where: { id },
    data: {
      ...(data.type !== undefined && { type: data.type }),
      ...(data.features !== undefined && { features: data.features }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });

  await db.licenseAuditLog.create({
    data: {
      licenseId: id,
      actorId: session.user.id,
      action: "EDITED",
      diff: { before, after: updated },
    },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) throw notFound("Лицензия не найдена");
  if (license.deletedAt) return NextResponse.json({ ok: true });

  const canDelete = hasPermission(
    session.user.permissions,
    "licenses.delete",
    session.user.isSuperAdmin,
  );
  if (!canDelete) throw forbidden();

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : null;

  await db.$transaction([
    db.license.update({ where: { id }, data: { deletedAt: new Date() } }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "DELETED", reason },
    }),
  ]);

  // Удалённая лицензия перестаёт занимать слот лимита представителя.
  await syncLicenseSlots(license.dealerId);

  return NextResponse.json({ ok: true });
});
