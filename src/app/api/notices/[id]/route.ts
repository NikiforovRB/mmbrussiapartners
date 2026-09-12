import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  active: z.boolean().optional(),
  requireAck: z.boolean().optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const notice = await db.loginNotice.findUnique({ where: { id } });
  if (!notice) throw notFound("Уведомление не найдено");

  const data = await parseBody(req, schema);
  await db.loginNotice.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.body !== undefined && { body: data.body.trim() }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.requireAck !== undefined && { requireAck: data.requireAck }),
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: id,
    action: "LOGIN_NOTICE_UPDATED",
    summary: data.title?.trim() ?? notice.title,
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const { id } = await ctx.params;
  const notice = await db.loginNotice.findUnique({ where: { id } });
  if (!notice) throw notFound("Уведомление не найдено");

  await db.loginNotice.delete({ where: { id } });
  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: id,
    action: "LOGIN_NOTICE_DELETED",
    summary: notice.title,
  });

  return NextResponse.json({ ok: true });
});
