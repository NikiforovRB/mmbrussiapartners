import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Только счётчик для колокольчика: один запрос по индексу (userId, readAt). */
export const GET = route(async () => {
  const session = await requireApprovedUser();
  const unread = await db.appNotification.count({
    where: { userId: session.user.id, readAt: null },
  });
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
});
