import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const patchSchema = z.object({
  type: z.enum(["Генерация", "Обновление", "Восстановление"]).optional(),
  features: z.record(z.union([z.boolean(), z.string()])).optional(),
  termStart: z.string().datetime().optional(),
  termEnd: z.string().datetime().optional(),
  customerFio: z.string().optional(),
  customerOrganization: z.string().nullable().optional(),
  customerEmail: z.string().email().nullable().optional().or(z.literal("")),
  customerPhone: z.string().nullable().optional().or(z.literal("")),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  vehicleVin: z.string().nullable().optional(),
  vehicleModel: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED", "REVOKED", "DRAFT"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const isOwner = license.dealerId === session.user.id;
  const canEdit =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.edit", session.user.isSuperAdmin) ||
    isOwner;
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Некорректные данные" }, { status: 400 });
  }
  const data = parsed.data;

  const before = license;
  const updated = await db.license.update({
    where: { id },
    data: {
      ...(data.type !== undefined && { type: data.type }),
      ...(data.features !== undefined && { features: data.features }),
      ...(data.termStart && { termStart: new Date(data.termStart) }),
      ...(data.termEnd && { termEnd: new Date(data.termEnd) }),
      ...(data.customerFio !== undefined && { customerFio: data.customerFio }),
      ...(data.customerOrganization !== undefined && { customerOrganization: data.customerOrganization }),
      ...(data.customerEmail !== undefined && { customerEmail: data.customerEmail || null }),
      ...(data.customerPhone !== undefined && { customerPhone: data.customerPhone || null }),
      ...(data.region !== undefined && { region: data.region }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.vehicleVin !== undefined && { vehicleVin: data.vehicleVin }),
      ...(data.vehicleModel !== undefined && { vehicleModel: data.vehicleModel }),
      ...(data.platform !== undefined && { platform: data.platform || null }),
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
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const canDelete = session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.delete", session.user.isSuperAdmin);
  if (!canDelete) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : null;

  await db.$transaction([
    db.license.update({ where: { id }, data: { deletedAt: new Date() } }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "DELETED", reason },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
