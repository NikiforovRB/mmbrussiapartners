import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound, parseBody, route } from "@/lib/api";
import { changedFields, recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";
import { isPublishedOnSite, queueDealerSiteSync } from "@/lib/site-dealers";
import { normalizePhone } from "@/lib/utils";

export const runtime = "nodejs";

const DEALER_ROLE_NAME = "Представитель";

const nameField = z.string().trim().max(80, "Не длиннее 80 символов");

const schema = z.object({
  password: z.string().min(8, "Пароль — минимум 8 символов").optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(["APPROVED", "SUSPENDED"]).optional(),
  /** Выкинуть пользователя со всех устройств, не меняя остального. */
  revokeSessions: z.literal(true).optional(),
  email: z.string().trim().toLowerCase().email("Некорректный email").max(254).optional(),
  isSuperAdmin: z.boolean().optional(),
  profile: z
    .object({
      lastName: nameField.optional(),
      firstName: nameField.optional(),
      middleName: nameField.optional(),
      phone: z.string().trim().max(40).optional(),
    })
    .optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("users.manage");

  const { id } = await ctx.params;
  const target = await db.user.findUnique({
    where: { id },
    include: { role: true, dealerProfile: true },
  });
  if (!target) throw notFound("Пользователь не найден");

  // Суперадминистратора редактирует только суперадминистратор.
  if (target.isSuperAdmin && !session.user.isSuperAdmin) {
    throw forbidden("Изменять суперадминистратора может только суперадминистратор.");
  }

  const data = await parseBody(req, schema);
  const isSelf = target.id === session.user.id;

  const update: Record<string, unknown> = {};
  const actions: string[] = [];

  if (data.password) {
    update.passwordHash = await hashPassword(data.password);
    update.passwordEncrypted = null;
    actions.push("USER_PASSWORD_RESET");
  }

  if (data.roleId && data.roleId !== target.roleId) {
    if (isSelf) throw badRequest("Нельзя менять собственную роль.");
    const role = await db.role.findUnique({ where: { id: data.roleId } });
    if (!role) throw notFound("Роль не найдена");
    if (role.name === DEALER_ROLE_NAME) {
      throw badRequest("Роль «Представитель» назначается только при регистрации дилера.");
    }
    update.roleId = role.id;
    actions.push("USER_ROLE_CHANGED");
  }

  if (data.status && data.status !== target.status) {
    if (isSelf) throw badRequest("Нельзя менять собственный статус.");
    update.status = data.status;
    actions.push("USER_STATUS_CHANGED");
  }

  if (data.revokeSessions) {
    if (isSelf) throw badRequest("Свои сеансы завершите выходом из кабинета.");
    actions.push("USER_SESSIONS_REVOKED");
  }

  if (data.isSuperAdmin !== undefined && data.isSuperAdmin !== target.isSuperAdmin) {
    if (!session.user.isSuperAdmin) {
      throw forbidden("Доступ супер-админа выдаёт только супер-админ.");
    }
    // Свой флаг не снимаем: иначе можно остаться без единого суперадмина.
    if (isSelf) throw badRequest("Нельзя менять собственный доступ супер-админа.");
    if (target.role.name === DEALER_ROLE_NAME) {
      throw badRequest("Представителю нельзя выдать доступ супер-админа.");
    }
    update.isSuperAdmin = data.isSuperAdmin;
    actions.push(data.isSuperAdmin ? "USER_SUPERADMIN_GRANTED" : "USER_SUPERADMIN_REVOKED");
  }

  if (data.email && data.email !== target.email) {
    const taken = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (taken) throw conflict("Пользователь с таким email уже существует");
    update.email = data.email;
    actions.push("USER_EMAIL_CHANGED");
  }

  const profileUpdate: { lastName?: string; firstName?: string; middleName?: string | null; phone?: string } = {};
  if (data.profile) {
    const p = data.profile;
    if (p.lastName !== undefined) profileUpdate.lastName = p.lastName;
    if (p.firstName !== undefined) profileUpdate.firstName = p.firstName;
    if (p.middleName !== undefined) profileUpdate.middleName = p.middleName || null;
    if (p.phone !== undefined) {
      const phone = normalizePhone(p.phone);
      if (phone && phone.replace(/\D/g, "").length < 10) throw badRequest("Некорректный телефон");
      profileUpdate.phone = phone;
    }
  }
  const before = {
    lastName: target.dealerProfile?.lastName ?? "",
    firstName: target.dealerProfile?.firstName ?? "",
    middleName: target.dealerProfile?.middleName ?? null,
    phone: target.dealerProfile?.phone ?? "",
  };
  const profileDiff = changedFields(before, profileUpdate);
  if (Object.keys(profileDiff).length > 0) actions.push("USER_PROFILE_UPDATED");

  // Новый пароль, блокировка и явный отзыв обнуляют все выданные сессии.
  if (update.passwordHash || update.status || data.revokeSessions) {
    update.sessionVersion = { increment: 1 };
  }

  if (Object.keys(update).length === 0 && Object.keys(profileDiff).length === 0) {
    return NextResponse.json({ ok: true });
  }

  // ФИО, телефон и фото хранятся в профиле; у сотрудника его может ещё не быть.
  if (Object.keys(profileDiff).length > 0) {
    update.dealerProfile = target.dealerProfile
      ? { update: profileUpdate }
      : {
          create: {
            lastName: profileUpdate.lastName ?? "",
            firstName: profileUpdate.firstName ?? "",
            middleName: profileUpdate.middleName ?? null,
            phone: profileUpdate.phone ?? "",
          },
        };
  }

  await db.user.update({ where: { id }, data: update });

  if (
    "phone" in profileDiff &&
    target.dealerProfile &&
    isPublishedOnSite(target.status, target.dealerProfile)
  ) {
    queueDealerSiteSync(id, "profile");
  }

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: id,
    action: actions.join(",") || "USER_UPDATED",
    summary: target.email,
    diff: changedFields(
      { ...before, email: target.email, isSuperAdmin: target.isSuperAdmin },
      {
        ...profileUpdate,
        email: update.email as string | undefined,
        isSuperAdmin: update.isSuperAdmin as boolean | undefined,
      },
    ),
  });

  return NextResponse.json({ ok: true });
});
