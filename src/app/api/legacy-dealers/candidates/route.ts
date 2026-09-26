import { NextResponse } from "next/server";
import { db, type Prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { fioFromParts } from "@/lib/utils";

export const runtime = "nodejs";

/** Представители портала для ручной привязки к записи старого ЛК. */
export const GET = route(async (req: Request) => {
  await requirePermission("dealers.edit");
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return NextResponse.json({ items: [] });

  const where: Prisma.UserWhereInput = {
    dealerProfile: { isNot: null },
    AND: words.map((w) => {
      const text = { contains: w, mode: "insensitive" as const };
      return {
        OR: [
          { email: text },
          { dealerProfile: { firstName: text } },
          { dealerProfile: { lastName: text } },
          { dealerProfile: { organization: text } },
          { dealerProfile: { city: text } },
          { dealerProfile: { phone: { contains: w.replace(/\D/g, "") || w } } },
        ],
      };
    }),
  };
  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      dealerProfile: { select: { firstName: true, lastName: true, middleName: true, city: true, phone: true } },
      legacyDealer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json({
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      fio: u.dealerProfile ? fioFromParts(u.dealerProfile) : "",
      city: u.dealerProfile?.city ?? null,
      phone: u.dealerProfile?.phone ?? null,
      linkedTo: u.legacyDealer ? { id: u.legacyDealer.id, name: u.legacyDealer.name } : null,
    })),
  });
});
