import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { lookupIpGeo } from "@/lib/geo-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const detected = clientIp(req.headers);
  const geo = await lookupIpGeo(detected, 3_000);
  return NextResponse.json({
    ok: Boolean(geo.country || geo.city),
    city: geo.city,
    region: geo.region,
    country: geo.country,
    countryCode: geo.countryCode,
    ip: geo.ip,
  });
}
