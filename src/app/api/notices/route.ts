import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { forbidden, parseBody, route, unauthenticated } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().min(1, "Укажите заголовок").max(200),
  body: z.string().min(1, "Укажите текст уведомления"),
  active: z.boolean().optional(),
  requireAck: z.boolean().optional(),
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const data = await parseBody(req, schema);
  const notice = await db.loginNotice.create({
    data: {
      title: data.title.trim(),
      body: data.body.trim(),
      active: data.active ?? true,
      requireAck: data.requireAck ?? true,
    },
  });

  await recordAdminAction({
    actorId: session.user.id,
    entity: "SETTINGS",
    entityId: notice.id,
    action: "LOGIN_NOTICE_CREATED",
    summary: notice.title,
  });

  return NextResponse.json({ id: notice.id });
});
