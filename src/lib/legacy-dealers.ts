import "server-only";

import { db } from "./db";

/** Телефон для сравнения: последние 10 цифр — так совпадут +7…, 8… и 7… */
export function phoneKey(raw?: string | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Ищет представителя в выгрузке старого ЛК DriveMods по email и телефону и,
 * если совпадение ровно одно, привязывает запись и снимает с него правило
 * «первая генерация — по клиентской цене». Спорные случаи оставляем
 * администратору: он привяжет запись вручную.
 */
export async function linkLegacyDealer(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      legacyDealer: { select: { id: true } },
      dealerProfile: { select: { phone: true, legacyDealer: true } },
    },
  });
  if (!user?.dealerProfile) return false;
  if (user.legacyDealer) {
    if (!user.dealerProfile.legacyDealer) {
      await db.dealerProfile.update({ where: { userId }, data: { legacyDealer: true } });
    }
    return true;
  }

  const phone = phoneKey(user.dealerProfile.phone);
  const candidates = await db.legacyDealer.findMany({
    where: {
      userId: null,
      source: "account",
      OR: [
        { email: { equals: user.email, mode: "insensitive" } },
        ...(phone ? [{ phone: { endsWith: phone } }] : []),
      ],
    },
    select: { id: true },
    take: 2,
  });
  if (candidates.length !== 1) return false;

  await db.$transaction([
    db.legacyDealer.update({ where: { id: candidates[0].id }, data: { userId } }),
    db.dealerProfile.update({ where: { userId }, data: { legacyDealer: true } }),
  ]);
  return true;
}
