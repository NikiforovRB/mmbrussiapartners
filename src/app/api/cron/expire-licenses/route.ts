import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { assertCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";

/**
 * Ежедневный перевод просроченных лицензий в EXPIRED.
 * Бессрочные (termEnd = null) под условие не попадают.
 */
export const GET = route(async (req: Request) => {
  assertCronRequest(req);

  const expired = await db.license.updateMany({
    where: { status: "ACTIVE", deletedAt: null, termEnd: { not: null, lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return NextResponse.json({ expired: expired.count });
});
