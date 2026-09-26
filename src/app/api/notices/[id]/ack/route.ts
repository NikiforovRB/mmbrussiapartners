import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

// Пользователь подтверждает ознакомление с уведомлением входа.
export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

  const { id } = await ctx.params;
  const notice = await db.loginNotice.findUnique({ where: { id } });
  if (!notice) throw notFound("Уведомление не найдено");

  await db.loginNoticeAck.upsert({
    where: { noticeId_userId: { noticeId: id, userId: session.user.id } },
    update: {},
    create: { noticeId: id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
});
