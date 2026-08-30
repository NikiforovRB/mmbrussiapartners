import "server-only";

import { Prisma, type PriceAdjustKind } from "@prisma/client";
import { db } from "@/lib/db";
import { defaultLicensePrice, licensePrice } from "@/lib/payments/provider";

/**
 * Цены лицензий. DRIVEMODS их не отдаёт — его API возвращает только продукт,
 * пакет и регион, — поэтому прайс ведётся в справочнике портала, а у
 * отдельных представителей может отличаться.
 *
 * Сумму всегда считает сервер: браузер присылает лишь выбранную позицию.
 */

export type PriceQuery = {
  product: string;
  bundle?: string | null;
  region?: string | null;
};

export type ResolvedPrice = {
  price: number;
  /** Позиция справочника, по которой посчитали; null — сработала запасная цена. */
  itemId: string | null;
  /** Цена назначена этому представителю лично. */
  personal: boolean;
};

/** Пакет и регион в справочнике хранятся пустой строкой, а не null. */
export function normalizeKey(value?: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

export function priceKey(q: PriceQuery): string {
  return [q.product.trim(), normalizeKey(q.bundle), normalizeKey(q.region)].join("\u0000");
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function applyAdjust(base: number, kind: PriceAdjustKind, value: number | null): number {
  if (kind === "PERCENT" && value !== null) {
    return Math.max(0, Math.round(base * (1 + value / 100) * 100) / 100);
  }
  if (kind === "FIXED" && value !== null) {
    return Math.max(0, Math.round((base + value) * 100) / 100);
  }
  return base;
}

/**
 * Позиция справочника для запроса. Точное совпадение важнее общего: цена для
 * MB-S5WM FULL RUS перебивает цену MB-S5WM FULL, а та — цену MB-S5WM.
 */
function matchItem<T extends { product: string; bundle: string; region: string }>(
  items: T[],
  q: PriceQuery,
): T | null {
  const product = q.product.trim();
  const bundle = normalizeKey(q.bundle);
  const region = normalizeKey(q.region);
  const candidates: [string, string][] = [
    [bundle, region],
    [bundle, ""],
    ["", region],
    ["", ""],
  ];
  for (const [b, r] of candidates) {
    const found = items.find((i) => i.product === product && i.bundle === b && i.region === r);
    if (found) return found;
  }
  return null;
}

/**
 * Цены сразу для набора позиций: мастер показывает список комплектаций, и
 * ходить в базу по каждой отдельно незачем.
 */
export async function resolvePrices(
  dealerId: string | null,
  queries: PriceQuery[],
): Promise<ResolvedPrice[]> {
  if (queries.length === 0) return [];

  const products = [...new Set(queries.map((q) => q.product.trim()).filter(Boolean))];
  const [items, profile, personal] = await Promise.all([
    products.length > 0
      ? db.priceListItem.findMany({ where: { product: { in: products } } })
      : Promise.resolve([]),
    dealerId
      ? db.dealerProfile.findUnique({
          where: { userId: dealerId },
          select: { priceAdjustKind: true, priceAdjustValue: true },
        })
      : Promise.resolve(null),
    dealerId
      ? db.dealerPrice.findMany({ where: { dealerId }, select: { itemId: true, price: true } })
      : Promise.resolve([]),
  ]);

  const personalById = new Map(personal.map((p) => [p.itemId, toNumber(p.price)]));
  const kind: PriceAdjustKind = profile?.priceAdjustKind ?? "NONE";
  const adjust = profile?.priceAdjustValue == null ? null : toNumber(profile.priceAdjustValue);

  return queries.map((q) => {
    const item = matchItem(items, q);
    if (!item) {
      // Позиции в справочнике нет: берём запасную цену из настроек, иначе
      // выдача лицензий встала бы из-за незаполненного прайса.
      return { price: licensePrice(q.bundle) || defaultLicensePrice(), itemId: null, personal: false };
    }
    const own = personalById.get(item.id);
    if (own !== undefined) return { price: own, itemId: item.id, personal: true };
    return { price: applyAdjust(toNumber(item.price), kind, adjust), itemId: item.id, personal: false };
  });
}

export async function resolvePrice(
  dealerId: string | null,
  query: PriceQuery,
): Promise<ResolvedPrice> {
  const [only] = await resolvePrices(dealerId, [query]);
  return only;
}

export function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}
