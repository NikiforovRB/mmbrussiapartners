import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";
import { hiddenNotificationTypes } from "@/lib/notification-mutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Только счётчик для колокольчика: подсчёт по индексу (userId, readAt) без отключённых разделов. */
export const GET = route(async () => {
  const session = await requireApprovedUser();
  const hidden = await hiddenNotificationTypes(session.user);
  const unread = await db.appNotification.count({
    where: { userId: session.user.id, readAt: null, ...(hidden.length ? { type: { notIn: hidden } } : {}) },
  });
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
});
