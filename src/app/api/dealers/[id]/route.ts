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
import { queueDealerSiteSync } from "@/lib/site-dealers";
import { linkLegacyDealer } from "@/lib/legacy-dealers";
import { clientIp } from "@/lib/rate-limit";
import { LOCATION_TEXT_MAX, normalizeLocation, recordLocationChange } from "@/lib/dealer-location";

export const runtime = "nodejs";

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().nullable().optional(),
  phone: z.string().optional(),
  organization: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  city: z.string().max(LOCATION_TEXT_MAX, `Город — не длиннее ${LOCATION_TEXT_MAX} символов`).nullable().optional(),
  region: z.string().max(LOCATION_TEXT_MAX, `Регион — не длиннее ${LOCATION_TEXT_MAX} символов`).nullable().optional(),
  country: z.string().max(60, "Страна — не длиннее 60 символов").nullable().optional(),
  address: z.string().nullable().optional(),
  siteComment: z.string().max(200, "Подпись на сайте — не длиннее 200 символов").nullable().optional(),
  licenseLimit: z.number().int().min(0).optional(),
  driveModsAccess: z.boolean().optional(),
  /** Работал в ЛК DriveMods. */
  legacyDealer: z.boolean().optional(),
});

const schema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  rejectionReason: z.string().trim().max(500, "Причина — не длиннее 500 символов").nullable().optional(),
  suspensionReason: z.string().trim().max(500, "Причина — не длиннее 500 символов").nullable().optional(),
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
  "country",
  "address",
  "siteComment",
  "driveModsAccess",
] as const;

const LOCATION_FIELDS = ["country", "region", "city"] as const;

/** Поля, которые видны в «Дилерской сети» на сайте. */
const SITE_PROFILE_FIELDS = ["phone", "city", "country", "siteComment"] as const;

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
  const wantsLegacy = d.profile?.legacyDealer !== undefined;

  if (!wantsStatus && !wantsRole && !wantsLimit && !wantsPlainEdit && !wantsLegacy) {
    throw badRequest("Нечего сохранять");
  }
  if (wantsLegacy && !can("pricing.manage") && !can("dealers.edit")) {
    throw forbidden("Нет права менять ценовые условия представителя");
  }
  // Причину отказа представитель видит в кабинете — без неё отклонять нельзя.
  if (d.status === "REJECTED" && (d.rejectionReason ?? "").length < 6) {
    throw badRequest("Укажите причину отклонения — минимум 6 символов");
  }
  // Причину блокировки представитель видит на экране входа.
  if (d.status === "SUSPENDED" && (d.suspensionReason ?? "").length < 6) {
    throw badRequest("Укажите причину блокировки — минимум 6 символов");
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

  const currentLocation = {
    country: target.dealerProfile?.country ?? null,
    region: target.dealerProfile?.region ?? null,
    city: target.dealerProfile?.city ?? null,
  };
  const location =
    wantsPlainEdit && d.profile && LOCATION_FIELDS.some((f) => d.profile?.[f] !== undefined)
      ? normalizeLocation(
          {
            country: d.profile.country !== undefined ? d.profile.country : currentLocation.country,
            region: d.profile.region !== undefined ? d.profile.region : currentLocation.region,
            city: d.profile.city !== undefined ? d.profile.city : currentLocation.city,
          },
          currentLocation,
        )
      : null;

  const profileUpdate: Record<string, unknown> = {};
  if (d.profile) {
    if (wantsPlainEdit) {
      if (d.profile.firstName !== undefined) profileUpdate.firstName = d.profile.firstName;
      if (d.profile.lastName !== undefined) profileUpdate.lastName = d.profile.lastName;
      if (d.profile.middleName !== undefined) profileUpdate.middleName = d.profile.middleName || null;
      if (d.profile.phone !== undefined) profileUpdate.phone = normalizePhone(d.profile.phone);
      if (d.profile.organization !== undefined) profileUpdate.organization = d.profile.organization || null;
      if (d.profile.inn !== undefined) profileUpdate.inn = d.profile.inn || null;
      if (location) Object.assign(profileUpdate, location);
      if (d.profile.address !== undefined) profileUpdate.address = d.profile.address || null;
      if (d.profile.siteComment !== undefined) {
        profileUpdate.siteComment = d.profile.siteComment?.trim() || null;
      }
      if (d.profile.driveModsAccess !== undefined) {
        profileUpdate.driveModsAccess = d.profile.driveModsAccess;
      }
    }
    if (wantsLimit) profileUpdate.licenseLimit = d.profile.licenseLimit;
    if (wantsLegacy) profileUpdate.legacyDealer = d.profile.legacyDealer;
  }
  if (d.status === "APPROVED") {
    profileUpdate.approvedById = session.user.id;
    profileUpdate.approvedAt = new Date();
    profileUpdate.rejectionReason = null;
    profileUpdate.suspensionReason = null;
  }
  if (d.status === "REJECTED") profileUpdate.rejectionReason = d.rejectionReason;
  if (d.status === "SUSPENDED") profileUpdate.suspensionReason = d.suspensionReason;
  // Заблокированного снимаем с сайта насовсем: после разблокировки телефон
  // вернётся только через новую заявку и одобрение.
  const publication = target.dealerProfile?.sitePublication;
  const unpublish =
    d.status === "SUSPENDED" && d.status !== target.status && (publication === "APPROVED" || publication === "PENDING");
  if (unpublish) {
    Object.assign(profileUpdate, {
      sitePublication: "REJECTED",
      sitePublicationNote: "Учётная запись заблокирована",
      sitePublicationAt: new Date(),
      sitePublicationById: session.user.id,
    });
  }

  await db.user.update({
    where: { id },
    data: {
      ...(wantsStatus && { status: d.status }),
      // Иначе после разблокировки снова заработали бы сессии, выданные до неё.
      // Отклонённого не разлогиниваем: в кабинете он сразу увидит причину.
      ...(d.status === "SUSPENDED" && d.status !== target.status && { sessionVersion: { increment: 1 } }),
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
      legacyDealer: target.dealerProfile?.legacyDealer,
      rejectionReason: target.dealerProfile?.rejectionReason ?? null,
      suspensionReason: target.dealerProfile?.suspensionReason ?? null,
      sitePublication: target.dealerProfile?.sitePublication ?? null,
      sitePublicationNote: target.dealerProfile?.sitePublicationNote ?? null,
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

  if (location && target.dealerProfile) {
    await recordLocationChange({
      userId: id,
      actorId: session.user.id,
      source: "ADMIN",
      before: currentLocation,
      after: location,
      ip: clientIp(req.headers),
    });
  }

  const statusChanged = wantsStatus && d.status !== target.status;
  if (statusChanged && d.status === "APPROVED") {
    await linkLegacyDealer(id).catch((err) => console.error("[dealers] сверка со старым ЛК не удалась", err));
  }
  if (statusChanged || SITE_PROFILE_FIELDS.some((f) => f in diff)) {
    queueDealerSiteSync(id, statusChanged ? "status" : "profile");
  }

  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: wantsStatus ? `STATUS_${d.status}` : wantsRole ? "ROLE_CHANGED" : "PROFILE_UPDATED",
    summary: target.email,
    diff,
  });
  if (unpublish) {
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: id,
      action: publication === "APPROVED" ? "SITE_PUBLICATION_REVOKED" : "SITE_PUBLICATION_REJECTED",
      summary: `${target.email}: учётная запись заблокирована`,
    });
  }

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
      body:
        d.status === "REJECTED"
          ? (d.rejectionReason ?? null)
          : d.status === "SUSPENDED"
            ? (d.suspensionReason ?? null)
            : null,
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
  const p = target.dealerProfile;
  if (p && (p.siteListed || p.sitePublication === "APPROVED" || p.siteSyncStatus === "failed")) {
    queueDealerSiteSync(id, "delete");
  }
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
