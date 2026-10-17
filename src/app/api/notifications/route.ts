import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseBody, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";
import { hasAdminScope } from "@/lib/permissions";
import { notificationActions } from "@/lib/notification-actions";
import { hiddenNotificationTypes } from "@/lib/notification-mutes";
import {
  NOTIFICATION_TAB_TYPES,
  isNotificationTab,
  tabForType,
  typesForTab,
  type NotificationTabId,
} from "@/lib/notification-tabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Сколько событий подгружаем в панель за раз. */
const PAGE_SIZE = 30;

export const GET = route(async (req: Request) => {
  const session = await requireApprovedUser();
  const params = new URL(req.url).searchParams;
  const rawTab = params.get("tab");
  const tab: NotificationTabId = isNotificationTab(rawTab) ? rawTab : "all";
  const before = params.get("before");
  const beforeDate = before ? new Date(before) : null;
  const hidden = await hiddenNotificationTypes(session.user);
  const tabTypes = typesForTab(tab);
  const types = tabTypes ? tabTypes.filter((t) => !hidden.includes(t)) : null;
  const visible = hidden.length ? { type: { notIn: hidden } } : {};

  const [rows, unread, unreadGroups] = await Promise.all([
    db.appNotification.findMany({
      where: {
        userId: session.user.id,
        ...(types ? { type: { in: types } } : visible),
        ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
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
    db.appNotification.count({ where: { userId: session.user.id, readAt: null, ...visible } }),
    db.appNotification.groupBy({
      by: ["type"],
      where: { userId: session.user.id, readAt: null, ...visible },
      _count: { _all: true },
    }),
  ]);

  const unreadByTab: Record<string, number> = { all: unread };
  for (const t of NOTIFICATION_TAB_TYPES) unreadByTab[t.id] = 0;
  for (const g of unreadGroups) {
    const id = tabForType(g.type);
    if (id) unreadByTab[id] += g._count._all;
  }

  const page = rows.slice(0, PAGE_SIZE);
  const actions = hasAdminScope(session.user.permissions, session.user.isSuperAdmin)
    ? await notificationActions(page, session.user)
    : null;

  return NextResponse.json({
    items: page.map((n) => ({ ...n, action: actions?.get(n.id) ?? null })),
    hasMore: rows.length > PAGE_SIZE,
    unread,
    unreadByTab,
  });
});

const markSchema = z.object({
  /** Пусто — отметить прочитанным всё (или всё во вкладке tab). */
  ids: z.array(z.string()).optional(),
  tab: z.string().optional(),
});

export const POST = route(async (req: Request) => {
  const session = await requireApprovedUser();

  const { ids, tab } = await parseBody(req, markSchema);
  const types = !ids?.length && isNotificationTab(tab) ? typesForTab(tab) : null;

  const { count } = await db.appNotification.updateMany({
    where: {
      userId: session.user.id,
      readAt: null,
      ...(ids?.length ? { id: { in: ids } } : {}),
      ...(types ? { type: { in: types } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, marked: count });
});
