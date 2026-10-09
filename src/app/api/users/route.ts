import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePermission } from "@/lib/session";
import { isDealerRoleName } from "@/lib/roles";

export const runtime = "nodejs";

// Системная роль дилера — её через управление пользователями не выдаём:
// дилеры регистрируются самостоятельно и получают эту роль автоматически.
const schema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Пароль — минимум 8 символов"),
  roleId: z.string().min(1, "Выберите роль"),
});

export const POST = route(async (req: Request) => {
  const session = await requirePermission("users.manage");

  const data = await parseBody(req, schema);

  const role = await db.role.findUnique({ where: { id: data.roleId } });
  if (!role) throw notFound("Роль не найдена");
  if (isDealerRoleName(role.name)) {
    throw badRequest("Роль «Дилер» назначается только при регистрации дилера.");
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
