import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, notFound, parseBody, route, unauthenticated } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  current: z.string().min(1, "Введите текущий пароль"),
  next: z.string().min(8, "Новый пароль — минимум 8 символов"),
});

export const PATCH = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const data = await parseBody(req, schema);

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw notFound("Пользователь не найден");

  const ok = await bcrypt.compare(data.current, user.passwordHash);
  if (!ok) throw badRequest("Неверный текущий пароль");

  const passwordHash = await hashPassword(data.next);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
});
