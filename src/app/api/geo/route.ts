import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { fetchWithTimeout } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEO_TIMEOUT_MS = 3_000;

export async function GET(req: Request) {
  const base = process.env.GEO_LOOKUP_URL ?? "http://ip-api.com/json";
  const detected = clientIp(req.headers);
  const ip = detected === "unknown" ? null : detected;
  if (!ip) return NextResponse.json({ ok: false, city: null, country: null, ip });
  const url = `${base}/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,query&lang=ru`;

  try {
    const res = await fetchWithTimeout(url, { timeoutMs: GEO_TIMEOUT_MS });
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
