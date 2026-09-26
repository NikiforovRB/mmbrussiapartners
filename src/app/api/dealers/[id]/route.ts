import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasAdminScope, hasPermission, type PermissionKey } from "@/lib/permissions";
import { badRequest, conflict, forbidden, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction, changedFields } from "@/lib/admin-audit";
import { notifyUser } from "@/lib/app-notifications";
import { deleteObject } from "@/lib/s3";
import { fioFromParts, normalizePhone, plural } from "@/lib/utils";
import { requireApprovedUser, requirePermission } from "@/lib/session";

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
  driveModsAccess: z.boolean().optional(),
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
  "driveModsAccess",
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "на рассмотрении",
  APPROVED: "одобрен",
  REJECTED: "отклонён",
  SUSPENDED: "заблокирован",
};

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

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
      if (d.profile.driveModsAccess !== undefined) {
        profileUpdate.driveModsAccess = d.profile.driveModsAccess;
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
      // Иначе после разблокировки снова заработали бы сессии, выданные до неё.
      ...((d.status === "SUSPENDED" || d.status === "REJECTED") &&
        d.status !== target.status && { sessionVersion: { increment: 1 } }),
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

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.delete", "Нет права на удаление представителей");
  const { id } = await ctx.params;
  if (id === session.user.id) throw forbidden("Собственную учётную запись удалить нельзя");

  const target = await db.user.findUnique({
    where: { id },
    include: {
      dealerProfile: true,
      role: { select: { permissions: true } },
      _count: {
        select: {
          licenses: true,
          payments: true,
          humaxPasswords: true,
          requestedCancellations: true,
          auditedActions: true,
          adminAuditActions: true,
        },
      },
    },
  });
  if (!target) throw notFound("Представитель не найден");
  if (target.isSuperAdmin || hasAdminScope(target.role.permissions)) {
    throw forbidden("Это учётная запись сотрудника, а не представителя — здесь её удалить нельзя");
  }

  // Лицензии, счета и история действий ссылаются на пользователя и нужны для
  // отчётности, поэтому удалять можно только того, кто ещё ничего не сделал.
  const c = target._count;
  const records = [
    c.licenses > 0 && `${c.licenses} ${plural(c.licenses, ["лицензия", "лицензии", "лицензий"])}`,
    c.payments > 0 && `${c.payments} ${plural(c.payments, ["платёж", "платежа", "платежей"])}`,
    c.humaxPasswords > 0 &&
      `${c.humaxPasswords} ${plural(c.humaxPasswords, ["пароль HUMAX", "пароля HUMAX", "паролей HUMAX"])}`,
    c.requestedCancellations > 0 && "заявки на аннулирование",
    c.auditedActions + c.adminAuditActions > 0 && "записи в логах",
  ].filter(Boolean);
  if (records.length > 0) {
    throw conflict(
      `Удалить нельзя: у представителя есть ${records.join(", ")}. Эти данные нужны для отчётности — заблокируйте представителя вместо удаления.`,
    );
  }

  await db.user.delete({ where: { id } });
  if (target.dealerProfile?.avatarKey) {
    await deleteObject(target.dealerProfile.avatarKey).catch((err) =>
      console.error("[dealer-delete] не удалось удалить фото", err),
    );
  }

  const fio = fioFromParts({
    firstName: target.dealerProfile?.firstName,
    lastName: target.dealerProfile?.lastName,
    middleName: target.dealerProfile?.middleName,
  });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: "DEALER_DELETED",
    summary: fio ? `${fio} (${target.email})` : target.email,
  });

  return NextResponse.json({ ok: true });
});
