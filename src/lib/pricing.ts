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

/**
 * Регистр и пробелы не должны создавать вторую позицию для того же продукта,
 * поэтому ключи приводим к единому виду и на записи, и на поиске. Пакет и
 * регион отсутствуют — это пустая строка, а не null.
 */
export function normalizeKey(value?: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

export function priceKey(q: PriceQuery): string {
  return [normalizeKey(q.product), normalizeKey(q.bundle), normalizeKey(q.region)].join("\u0000");
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
 * Позиция справочника для запроса — только точное совпадение тройки.
 *
 * MB-S5WM FULL RUS, MB-S5WM FULL CHN и MB-S5WM ECO — три разных товара со
 * своими ценами, поэтому подставлять цену соседа нельзя: незаполненная
 * позиция должна честно уйти на запасную цену и попасть в список без цен.
 */
function matchItem<T extends { product: string; bundle: string; region: string }>(
  items: T[],
  q: PriceQuery,
): T | null {
  const key = priceKey(q);
  return items.find((i) => priceKey({ product: i.product, bundle: i.bundle, region: i.region }) === key) ?? null;
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

  // В справочнике продукт хранится нормализованным, поэтому и ищем по такому же.
  const products = [...new Set(queries.map((q) => normalizeKey(q.product)).filter(Boolean))];
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

/** Подпись позиции: продукт, а за ним пакет и регион, если они есть. */
export function positionLabel(q: PriceQuery): string {
  return [q.product, q.bundle, q.region].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
}
