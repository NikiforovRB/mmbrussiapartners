import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const now = new Date();
  const expired = await db.license.updateMany({
    where: { status: "ACTIVE", deletedAt: null, termEnd: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return NextResponse.json({ expired: expired.count });
}
