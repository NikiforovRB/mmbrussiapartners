import "server-only";

import type { LocationChangeSource, Prisma } from "@prisma/client";
import { db } from "./db";
import { badRequest } from "./api";
import { countryOrDefault, findCountry, regionsFor, sameLocationValue } from "./geo-catalog";

export type DealerLocation = { country: string | null; region: string | null; city: string | null };

export const LOCATION_TEXT_MAX = 120;

const clean = (v: string | null | undefined) => v?.trim().replace(/\s+/g, " ") || null;

/**
 * Приводит местоположение к справочнику: страна — из списка (синонимы вроде
 * «Кыргызстан» сводятся к одному названию), регион — из списка страны, если он
 * у неё есть. Значение, введённое до появления списков, можно оставить как
 * было — иначе профиль со старым регионом нельзя было бы сохранить.
 */
export function normalizeLocation(next: DealerLocation, current: DealerLocation): DealerLocation {
  const rawCountry = clean(next.country);
  const region = clean(next.region);
  const city = clean(next.city);
  if ((region?.length ?? 0) > LOCATION_TEXT_MAX || (city?.length ?? 0) > LOCATION_TEXT_MAX) {
    throw badRequest(`Регион и город — не длиннее ${LOCATION_TEXT_MAX} символов`);
  }

  const known = rawCountry ? findCountry(rawCountry) : null;
  if (rawCountry && !known && !sameLocationValue(rawCountry, current.country)) {
    throw badRequest("Выберите страну из списка");
  }
  const country = known?.name ?? rawCountry;

  const regions = regionsFor(country);
  const keepsOldRegion =
    sameLocationValue(region, current.region) &&
    sameLocationValue(countryOrDefault(country), countryOrDefault(current.country));
  if (regions && region && !keepsOldRegion && !regions.some((r) => r.name === region)) {
    throw badRequest("Выберите регион из списка");
  }
  return { country, region, city };
}

function locationChanged(before: DealerLocation, after: DealerLocation): boolean {
  return (
    !sameLocationValue(countryOrDefault(before.country), countryOrDefault(after.country)) ||
    !sameLocationValue(before.region, after.region) ||
    !sameLocationValue(before.city, after.city)
  );
}

/**
 * Пишет смену страны, региона или города в историю для администратора.
 * Пустая страна равна России — переход между ними изменением не считается.
 */
export async function recordLocationChange(
  args: {
    userId: string;
    actorId?: string | null;
    source: LocationChangeSource;
    before: DealerLocation | null;
    after: DealerLocation;
    ip?: string | null;
  },
  client: Prisma.TransactionClient = db,
): Promise<boolean> {
  const before = args.before ?? { country: null, region: null, city: null };
  const changed = args.before
    ? locationChanged(before, args.after)
    : Boolean(args.after.country || args.after.region || args.after.city);
  if (!changed) return false;
  await client.dealerLocationChange.create({
    data: {
      userId: args.userId,
      actorId: args.actorId ?? null,
      source: args.source,
      countryFrom: before.country,
      countryTo: args.after.country,
      regionFrom: before.region,
      regionTo: args.after.region,
      cityFrom: before.city,
      cityTo: args.after.city,
      ip: args.ip && args.ip !== "unknown" ? args.ip : null,
    },
  });
  return true;
}
