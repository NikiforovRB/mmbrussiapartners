import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const DEALER_ROLE_NAME = "Представитель";

const schema = z.object({
  password: z.string().min(8, "Пароль — минимум 8 символов").optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(["APPROVED", "SUSPENDED"]).optional(),
  /** Выкинуть пользователя со всех устройств, не меняя остального. */
  revokeSessions: z.literal(true).optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("users.manage");

  const { id } = await ctx.params;
  const target = await db.user.findUnique({ where: { id }, include: { role: true } });
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

  // Новый пароль, блокировка и явный отзыв обнуляют все выданные сессии.
  if (update.passwordHash || update.status || data.revokeSessions) {
    update.sessionVersion = { increment: 1 };
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db.user.update({ where: { id }, data: update });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: id,
    action: actions.join(",") || "USER_UPDATED",
    summary: target.email,
  });

  return NextResponse.json({ ok: true });
});
