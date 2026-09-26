import "server-only";

import { db } from "./db";
import { lookupIpGeo } from "./geo-ip";

/** Один и тот же адрес отмечаем не чаще раза в 10 минут — иначе запись на каждый запрос. */
const THROTTLE_MS = 10 * 60_000;
const MAX_TRACKED = 5_000;

const lastSeen = new Map<string, number>();

function throttled(key: string, now: number): boolean {
  const last = lastSeen.get(key);
  if (last !== undefined && now - last < THROTTLE_MS) return true;
  lastSeen.set(key, now);
  if (lastSeen.size > MAX_TRACKED) {
    for (const [k, t] of lastSeen) if (now - t >= THROTTLE_MS) lastSeen.delete(k);
  }
  return false;
}

/**
 * Запоминает IP, с которого пользователь работает в кабинете. Страну и город
 * определяем только для нового адреса. Ошибки глушим: учёт адресов не должен
 * мешать входу и работе.
 */
export async function trackUserIp(userId: string, ip: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!userId || !ip || ip === "unknown") return;
  const now = Date.now();
  if (throttled(`${userId}|${ip}`, now) && !opts.force) return;
  try {
    const key = { userId_ip: { userId, ip } };
    const existing = await db.userIp.findUnique({ where: key, select: { id: true } });
    if (existing) {
      await db.userIp.update({
        where: { id: existing.id },
        data: { hits: { increment: 1 }, lastSeenAt: new Date(now) },
      });
      return;
    }
    const geo = await lookupIpGeo(ip);
    await db.userIp.upsert({
      where: key,
      create: { userId, ip, country: geo.country, countryCode: geo.countryCode, city: geo.city },
      update: { hits: { increment: 1 }, lastSeenAt: new Date(now) },
    });
  } catch (err) {
    console.error("[user-ips] не удалось записать адрес", err);
  }
}
