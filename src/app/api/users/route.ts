import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  parseBody,
  route,
  unauthenticated,
} from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

// Системная роль представителя — её через управление пользователями не выдаём:
// дилеры регистрируются самостоятельно и получают эту роль автоматически.
const DEALER_ROLE_NAME = "Представитель";

const schema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Пароль — минимум 8 символов"),
  roleId: z.string().min(1, "Выберите роль"),
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "users.manage", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const data = await parseBody(req, schema);

  const role = await db.role.findUnique({ where: { id: data.roleId } });
  if (!role) throw notFound("Роль не найдена");
  if (role.name === DEALER_ROLE_NAME) {
    throw badRequest("Роль «Представитель» назначается только при регистрации дилера.");
  }

  const email = data.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw conflict("Пользователь с таким email уже существует");

  const passwordHash = await hashPassword(data.password);
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      status: "APPROVED",
      roleId: role.id,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: user.id,
    action: "USER_CREATED",
    summary: `${email} · ${role.name}`,
  });

  return NextResponse.json({ id: user.id });
});
