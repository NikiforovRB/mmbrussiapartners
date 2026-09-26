import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAdminScope } from "@/lib/permissions";
import { forbidden, notFound, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { isPasswordVaultConfigured, openPassword, sealPassword } from "@/lib/password-vault";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(8, "Пароль — минимум 8 символов").max(128, "Слишком длинный пароль"),
});

/** Только представители: пароли сотрудников здесь не показываются и не меняются. */
async function loadDealer(id: string) {
  const target = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      isSuperAdmin: true,
      passwordEncrypted: true,
      role: { select: { permissions: true } },
    },
  });
  if (!target) throw notFound("Представитель не найден");
  if (target.isSuperAdmin || hasAdminScope(target.role.permissions)) {
    throw forbidden("Это учётная запись сотрудника — её пароль здесь недоступен");
  }
  return target;
}

export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requirePermission("dealers.passwords", "Нет права смотреть пароли представителей");
    const { id } = await ctx.params;
    const target = await loadDealer(id);

    const password = openPassword(target.id, target.passwordEncrypted);
    if (password !== null) {
      await recordAdminAction({
        actorId: session.user.id,
        entity: "DEALER",
        entityId: target.id,
        action: "PASSWORD_VIEWED",
        summary: target.email,
      });
    }
    return NextResponse.json(
      { password, configured: isPasswordVaultConfigured() },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { rateLimit: { limit: 60, windowMs: 10 * 60_000, name: "dealer-password-view" } },
);

export const PUT = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.passwords", "Нет права менять пароли представителей");
  const { id } = await ctx.params;
  const target = await loadDealer(id);
  const { password } = await parseBody(req, schema);

  // Новый пароль отзывает все сессии представителя.
  await db.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(password),
      passwordEncrypted: sealPassword(target.id, password),
      sessionVersion: { increment: 1 },
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: target.id,
    action: "PASSWORD_CHANGED",
    summary: target.email,
  });

  return NextResponse.json({ ok: true, stored: isPasswordVaultConfigured() });
});
