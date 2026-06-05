import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/notifications";
import { addDays, formatRuDate } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * Vercel Cron — daily license expiry reminder for licenses expiring in <= 14 days.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const upcoming = await db.license.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      termEnd: { gte: new Date(), lte: addDays(new Date(), 14) },
    },
    include: { dealer: true },
    take: 200,
  });

  let sent = 0;
  for (const l of upcoming) {
    if (!l.dealer.notifyByEmail) continue;
    await sendEmail({
      to: l.dealer.email,
      userId: l.dealer.id,
      subject: `Скоро истекает лицензия ${l.number}`,
      html: `<p>Лицензия <strong>${l.number}</strong> истекает <strong>${formatRuDate(l.termEnd)}</strong>.</p>`,
    });
    sent++;
  }
  return NextResponse.json({ checked: upcoming.length, sent });
}
