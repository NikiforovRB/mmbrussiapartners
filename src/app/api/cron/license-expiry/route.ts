import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { assertCronRequest } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/notifications";
import { notifyUser } from "@/lib/app-notifications";
import { addDays, formatRuDate } from "@/lib/dates";

export const runtime = "nodejs";

/** Сколько писем шлём одновременно — чтобы не выстроить 200 ожиданий в ряд. */
const BATCH = 8;

/**
 * Ежедневное напоминание о лицензиях, истекающих в ближайшие 14 дней.
 * Бессрочные (termEnd = null) в выборку не попадают.
 */
export const GET = route(async (req: Request) => {
  assertCronRequest(req);

  const now = new Date();
  const upcoming = await db.license.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      termEnd: { not: null, gte: now, lte: addDays(now, 14) },
    },
    include: { dealer: true },
    take: 200,
  });

  const targets = upcoming.filter((l) => l.dealer.notifyByEmail && l.termEnd);

  let sent = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map(async (l) => {
        const until = formatRuDate(l.termEnd as Date);
        await sendEmail({
          to: l.dealer.email,
          userId: l.dealer.id,
          subject: `Скоро истекает лицензия ${l.number}`,
          html: `<p>Лицензия <strong>${l.number}</strong> истекает <strong>${until}</strong>.</p>`,
        });
        await notifyUser(l.dealer.id, {
          type: "LICENSE_ISSUED",
          title: `Лицензия ${l.number} истекает ${until}`,
          body: "Продлите лицензию, чтобы она осталась активной.",
          link: `/dealer/licenses/${l.id}`,
        });
      }),
    );
    sent += results.filter((r) => r.status === "fulfilled").length;
  }

  return NextResponse.json({ checked: upcoming.length, sent });
});
