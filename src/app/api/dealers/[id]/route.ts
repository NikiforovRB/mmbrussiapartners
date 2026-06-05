import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { normalizePhone } from "@/lib/utils";

export const runtime = "nodejs";

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().nullable().optional(),
  phone: z.string().optional(),
  organization: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  licenseLimit: z.number().int().min(0).optional(),
  phoneVisibleOnSite: z.boolean().optional(),
});

const schema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  rejectionReason: z.string().nullable().optional(),
  roleId: z.string().optional(),
  profile: profileSchema.optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const isAdmin =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "dealers.approve", session.user.isSuperAdmin) ||
    hasPermission(session.user.permissions, "dealers.edit", session.user.isSuperAdmin);
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const d = parsed.data;

  const target = await db.user.findUnique({ where: { id }, include: { dealerProfile: true } });
  if (!target) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await db.user.update({
    where: { id },
    data: {
      ...(d.status && { status: d.status }),
      ...(d.roleId && { roleId: d.roleId }),
      ...(d.profile && {
        dealerProfile: {
          update: {
            ...(d.profile.firstName !== undefined && { firstName: d.profile.firstName }),
            ...(d.profile.lastName !== undefined && { lastName: d.profile.lastName }),
            ...(d.profile.middleName !== undefined && { middleName: d.profile.middleName || null }),
            ...(d.profile.phone !== undefined && { phone: normalizePhone(d.profile.phone) }),
            ...(d.profile.organization !== undefined && { organization: d.profile.organization || null }),
            ...(d.profile.inn !== undefined && { inn: d.profile.inn || null }),
            ...(d.profile.city !== undefined && { city: d.profile.city || null }),
            ...(d.profile.region !== undefined && { region: d.profile.region || null }),
            ...(d.profile.address !== undefined && { address: d.profile.address || null }),
            ...(d.profile.licenseLimit !== undefined && { licenseLimit: d.profile.licenseLimit }),
            ...(d.profile.phoneVisibleOnSite !== undefined && { phoneVisibleOnSite: d.profile.phoneVisibleOnSite }),
            ...(d.status === "APPROVED" && { approvedById: session.user.id, approvedAt: new Date(), rejectionReason: null }),
            ...(d.status === "REJECTED" && d.rejectionReason !== undefined && { rejectionReason: d.rejectionReason }),
          },
        },
      }),
      ...(d.status === "REJECTED" && d.rejectionReason !== undefined && !d.profile && {
        dealerProfile: { update: { rejectionReason: d.rejectionReason } },
      }),
      ...(d.status === "APPROVED" && !d.profile && {
        dealerProfile: {
          update: { approvedById: session.user.id, approvedAt: new Date(), rejectionReason: null },
        },
      }),
    },
  });

  return NextResponse.json({ ok: true });
}
