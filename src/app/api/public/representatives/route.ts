import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  const dealers = await db.dealerProfile.findMany({
    where: {
      phoneVisibleOnSite: true,
      user: { status: "APPROVED" },
    },
    include: { user: { select: { email: true } } },
    orderBy: [{ region: "asc" }, { city: "asc" }, { lastName: "asc" }],
  });

  const list = dealers.map((d) => ({
    fio: [d.lastName, d.firstName, d.middleName].filter(Boolean).join(" "),
    organization: d.organization ?? null,
    phone: d.phone,
    city: d.city ?? null,
    region: d.region ?? null,
  }));

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  });

  const origin = process.env.PUBLIC_SITE_ORIGIN;
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }

  return new NextResponse(JSON.stringify(list), { headers });
}

export function OPTIONS() {
  const origin = process.env.PUBLIC_SITE_ORIGIN ?? "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
