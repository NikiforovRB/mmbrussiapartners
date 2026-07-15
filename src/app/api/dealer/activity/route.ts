import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
  }
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const logs = await db.licenseAuditLog.findMany({
    where: {
      actorId: session.user.id,
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { license: { select: { id: true, number: true } } },
  });

  return NextResponse.json({
    date: start.toISOString(),
    count: logs.length,
    items: logs.map((l) => ({
      id: l.id,
      action: l.action,
      reason: l.reason,
      createdAt: l.createdAt,
      licenseId: l.license?.id ?? null,
      licenseNumber: l.license?.number ?? null,
    })),
  });
}
