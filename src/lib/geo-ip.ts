import "server-only";

import { fetchWithTimeout } from "./http";

export type IpGeo = {
  ip: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
};

const EMPTY: Omit<IpGeo, "ip"> = { country: null, countryCode: null, city: null };

/** Адреса локальной сети: гео-сервис их не знает, а запрос только тратит лимит. */
function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}

/**
 * Страна и город по IP через GEO_LOOKUP_URL (по умолчанию ip-api.com). Сбой
 * сервиса не должен ломать то, ради чего адрес определяли, поэтому ошибки
 * превращаются в пустой результат.
 */
export async function lookupIpGeo(ip: string, timeoutMs = 3_000): Promise<IpGeo> {
  // Без адреса клиента ip-api вернул бы расположение самого сервера.
  if (!ip || ip === "unknown") return { ip: null, ...EMPTY };
  if (isPrivateIp(ip)) return { ip, ...EMPTY };
  try {
    const base = process.env.GEO_LOOKUP_URL ?? "http://ip-api.com/json";
    const res = await fetchWithTimeout(
      `${base}/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,query&lang=ru`,
      { timeoutMs },
    );
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      city?: string;
      query?: string;
    };
    if (data.status !== "success") return { ip, ...EMPTY };
    return {
      ip: data.query ?? ip,
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      city: data.city ?? null,
    };
  } catch {
    return { ip, ...EMPTY };
  }
}
