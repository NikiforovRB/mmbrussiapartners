import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  const real = req.headers.get("x-real-ip");
  return real?.trim() || null;
}

export async function GET(req: Request) {
  const base = process.env.GEO_LOOKUP_URL ?? "http://ip-api.com/json";
  const ip = clientIp(req);
  const url = `${base}/${ip ?? ""}?fields=status,country,countryCode,city,query&lang=ru`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      city?: string;
      query?: string;
    };
    if (data.status !== "success") {
      return NextResponse.json({ ok: false, city: null, country: null, ip });
    }
    return NextResponse.json({
      ok: true,
      city: data.city ?? null,
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      ip: data.query ?? ip,
    });
  } catch {
    return NextResponse.json({ ok: false, city: null, country: null, ip });
  }
}
