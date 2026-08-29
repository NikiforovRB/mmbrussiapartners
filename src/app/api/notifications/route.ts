import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBody, route, unauthenticated } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Сколько событий держим в выезжающей панели. */
const PAGE_SIZE = 20;

export const GET = route(async () => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const [items, unread] = await Promise.all([
    db.appNotification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.appNotification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);

  return NextResponse.json({ items, unread });
});

const markSchema = z.object({
  /** Пусто — отметить прочитанным всё. */
  ids: z.array(z.string()).optional(),
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { ids } = await parseBody(req, markSchema);

  const { count } = await db.appNotification.updateMany({
    where: {
      userId: session.user.id,
      readAt: null,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, marked: count });
});
