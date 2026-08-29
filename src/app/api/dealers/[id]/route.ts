import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction, changedFields } from "@/lib/admin-audit";
import { notifyUser } from "@/lib/app-notifications";
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

/** Поля профиля, которые меняются обычным правом на редактирование. */
const PLAIN_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "middleName",
  "phone",
  "organization",
  "inn",
  "city",
  "region",
  "address",
  "phoneVisibleOnSite",
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "на рассмотрении",
  APPROVED: "одобрен",
  REJECTED: "отклонён",
  SUSPENDED: "заблокирован",
};

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { id } = await ctx.params;
  const d = await parseBody(req, schema);

  const can = (perm: PermissionKey) =>
    hasPermission(session.user.permissions, perm, session.user.isSuperAdmin);

  // Каждое поле закрыто своим правом: иначе одно лишь dealers.edit
  // позволяло бы выдать себе любую роль и любой лимит.
  const wantsStatus = d.status !== undefined;
  const wantsRole = d.roleId !== undefined;
  const wantsLimit = d.profile?.licenseLimit !== undefined;
  const wantsPlainEdit =
    d.profile !== undefined && PLAIN_PROFILE_FIELDS.some((f) => d.profile?.[f] !== undefined);

  if (!wantsStatus && !wantsRole && !wantsLimit && !wantsPlainEdit) {
    throw badRequest("Нечего сохранять");
  }
  if (wantsStatus) {
    const perm: PermissionKey = d.status === "SUSPENDED" ? "dealers.suspend" : "dealers.approve";
    if (!can(perm) && !can("dealers.approve")) throw forbidden("Нет права менять статус представителя");
  }
  if (wantsRole && !can("users.manage")) throw forbidden("Нет права менять роль пользователя");
  if (wantsLimit && !can("dealers.setLimit")) throw forbidden("Нет права менять лимит лицензий");
  if (wantsPlainEdit && !can("dealers.edit")) throw forbidden("Нет права редактировать профиль");

  // Даже с полными правами администратор не меняет собственные роль и статус:
  // это единственный способ случайно или намеренно запереть себя самого
  // либо, наоборот, поднять себе привилегии.
  if (id === session.user.id && (wantsRole || wantsStatus)) {
    throw forbidden("Собственные роль и статус изменить нельзя");
  }

  const target = await db.user.findUnique({ where: { id }, include: { dealerProfile: true } });
  if (!target) throw notFound("Представитель не найден");
  if (target.isSuperAdmin && wantsRole) {
    throw forbidden("Роль суперадминистратора менять нельзя");
  }

  const profileUpdate: Record<string, unknown> = {};
  if (d.profile) {
    if (wantsPlainEdit) {
      if (d.profile.firstName !== undefined) profileUpdate.firstName = d.profile.firstName;
      if (d.profile.lastName !== undefined) profileUpdate.lastName = d.profile.lastName;
      if (d.profile.middleName !== undefined) profileUpdate.middleName = d.profile.middleName || null;
      if (d.profile.phone !== undefined) profileUpdate.phone = normalizePhone(d.profile.phone);
      if (d.profile.organization !== undefined) profileUpdate.organization = d.profile.organization || null;
      if (d.profile.inn !== undefined) profileUpdate.inn = d.profile.inn || null;
      if (d.profile.city !== undefined) profileUpdate.city = d.profile.city || null;
      if (d.profile.region !== undefined) profileUpdate.region = d.profile.region || null;
      if (d.profile.address !== undefined) profileUpdate.address = d.profile.address || null;
      if (d.profile.phoneVisibleOnSite !== undefined) {
        profileUpdate.phoneVisibleOnSite = d.profile.phoneVisibleOnSite;
      }
    }
    if (wantsLimit) profileUpdate.licenseLimit = d.profile.licenseLimit;
  }
  if (d.status === "APPROVED") {
    profileUpdate.approvedById = session.user.id;
    profileUpdate.approvedAt = new Date();
    profileUpdate.rejectionReason = null;
  }
  if (d.status === "REJECTED" && d.rejectionReason !== undefined) {
    profileUpdate.rejectionReason = d.rejectionReason;
  }

  await db.user.update({
    where: { id },
    data: {
      ...(wantsStatus && { status: d.status }),
      ...(wantsRole && { roleId: d.roleId }),
      ...(Object.keys(profileUpdate).length > 0 &&
        target.dealerProfile && { dealerProfile: { update: profileUpdate } }),
    },
  });

  const diff = changedFields(
    {
      status: target.status,
      roleId: target.roleId,
      licenseLimit: target.dealerProfile?.licenseLimit,
      ...Object.fromEntries(
        PLAIN_PROFILE_FIELDS.map((f) => [f, target.dealerProfile?.[f] ?? null]),
      ),
    },
    {
      ...(wantsStatus && { status: d.status }),
      ...(wantsRole && { roleId: d.roleId }),
      ...profileUpdate,
    },
  );

  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: wantsStatus ? `STATUS_${d.status}` : wantsRole ? "ROLE_CHANGED" : "PROFILE_UPDATED",
    summary: target.email,
    diff,
  });

  if (wantsStatus && d.status && d.status !== target.status) {
    const type =
      d.status === "APPROVED"
        ? "DEALER_APPROVED"
        : d.status === "REJECTED"
          ? "DEALER_REJECTED"
          : "DEALER_SUSPENDED";
    await notifyUser(id, {
      type,
      title: `Ваша учётная запись: ${STATUS_LABEL[d.status]}`,
      body: d.status === "REJECTED" ? (d.rejectionReason ?? null) : null,
      link: "/dealer",
    });
  }

  return NextResponse.json({ ok: true });
});
