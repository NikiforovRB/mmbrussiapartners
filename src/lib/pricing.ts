import "server-only";

import { Prisma, type PriceAdjustKind } from "@prisma/client";
import { db } from "@/lib/db";
import { defaultLicensePrice, licensePrice } from "@/lib/payments/provider";

/**
 * Цены лицензий. DRIVEMODS их не отдаёт — его API возвращает только продукт,
 * пакет и регион, — поэтому прайс ведётся в справочнике портала, а у
 * отдельных дилеров может отличаться.
 *
 * Сумму всегда считает сервер: браузер присылает лишь выбранную позицию.
 */

export type PriceQuery = {
  product: string;
  bundle?: string | null;
  region?: string | null;
};

export type PriceBasis = "personal" | "client_tier" | "dealer" | "fallback";

export type ResolvedPrice = {
  price: number;
  /** Позиция справочника, по которой посчитали; null — сработала запасная цена. */
  itemId: string | null;
  /** Цена назначена этому дилеру лично. */
  personal: boolean;
  /** Как получена цена — для подсказок в интерфейсе. */
  basis: PriceBasis;
  /** Базовая цена позиции (себестоимость) — только для администраторов. */
  basePrice: number | null;
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

type CatalogKey = { product: string; bundle: string; region: string };

/**
 * Позиция справочника для запроса.
 *
 * MB-S5WM FULL RUS, MB-S5WM FULL CHN и MB-S5WM ECO — три разных товара со
 * своими ценами, поэтому цену соседа по региону не подставляем: незаполненная
 * позиция честно уходит на запасную цену и попадает в список без цен.
 * Исключения однозначны: позиция без региона — общая цена для всех регионов,
 * а если DRIVEMODS региона не прислал (у MB-S5WM его нет), подходит
 * единственная позиция с тем же продуктом и комплектацией.
 */
export function findPriceItem<T extends CatalogKey>(items: T[], q: PriceQuery): T | null {
  const product = normalizeKey(q.product);
  const bundle = normalizeKey(q.bundle);
  const region = normalizeKey(q.region);
  const same = items.filter((i) => normalizeKey(i.product) === product && normalizeKey(i.bundle) === bundle);
  return (
    same.find((i) => normalizeKey(i.region) === region) ??
    same.find((i) => normalizeKey(i.region) === "") ??
    (!region && same.length === 1 ? same[0] : null)
  );
}

/**
 * Регион продукта для лицензии. DRIVEMODS отдаёт его не для всех продуктов:
 * тогда берём регион позиции справочника (она для продукта и комплектации
 * одна), иначе — код рынка из версии ПО: KA4.KOR.S5W_M.V → KOR.
 */
export function inferProductRegion(
  q: PriceQuery,
  items: CatalogKey[],
  versionSoftware?: string | null,
): string | null {
  const own = normalizeKey(q.region);
  if (own) return own;
  const item = findPriceItem(items, q);
  if (item && normalizeKey(item.region)) return normalizeKey(item.region);
  const market = normalizeKey((versionSoftware ?? "").split(".")[1]);
  return /^[A-Z]{3}$/.test(market) ? market : null;
}

/**
 * Дозаполняет у выданных лицензий пустые регион продукта и базовую цену по
 * справочнику — после правки позиции, чтобы отчёты не показывали «—» по
 * лицензиям, выданным до того, как позицию завели.
 */
export async function fillLicenseCatalogGaps(): Promise<void> {
  await db.$executeRaw`
    UPDATE "License" l
    SET "productRegion" = p."region"
    FROM (
      SELECT "product", "bundle", min("region") AS "region"
      FROM "PriceListItem"
      GROUP BY "product", "bundle"
      HAVING count(*) = 1 AND min("region") <> ''
    ) p
    WHERE coalesce(trim(l."productRegion"), '') = ''
      AND upper(trim(l."product")) = p."product"
      AND upper(coalesce(trim(l."bundle"), '')) = p."bundle"`;
  await db.$executeRaw`
    UPDATE "License" l
    SET "basePrice" = i."myPrice"
    FROM "PriceListItem" i
    WHERE l."basePrice" IS NULL
      AND i."myPrice" IS NOT NULL
      AND upper(trim(l."product")) = i."product"
      AND upper(coalesce(trim(l."bundle"), '')) = i."bundle"
      AND (upper(coalesce(trim(l."productRegion"), '')) = i."region" OR i."region" = '')`;
}

/** Регионы продукта для набора позиций одного ШГУ (см. inferProductRegion). */
export async function inferProductRegions(
  queries: PriceQuery[],
  versionSoftware?: string | null,
): Promise<(string | null)[]> {
  const products = [...new Set(queries.map((q) => normalizeKey(q.product)).filter(Boolean))];
  const items =
    products.length > 0
      ? await db.priceListItem.findMany({
          where: { product: { in: products } },
          select: { product: true, bundle: true, region: true },
        })
      : [];
  return queries.map((q) => inferProductRegion(q, items, versionSoftware));
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
          select: { priceAdjustKind: true, priceAdjustValue: true, priceTier: true },
        })
      : Promise.resolve(null),
    dealerId
      ? db.dealerPrice.findMany({ where: { dealerId }, select: { itemId: true, price: true } })
      : Promise.resolve([]),
  ]);

  const personalById = new Map(personal.map((p) => [p.itemId, toNumber(p.price)]));
  const kind: PriceAdjustKind = profile?.priceAdjustKind ?? "NONE";
  const adjust = profile?.priceAdjustValue == null ? null : toNumber(profile.priceAdjustValue);
  const tier = profile?.priceTier === "CLIENT" ? "CLIENT" : "DEALER";

  return queries.map((q) => {
    const item = findPriceItem(items, q);
    if (!item) {
      // Позиции в справочнике нет: берём запасную цену из настроек, иначе
      // выдача лицензий встала бы из-за незаполненного прайса.
      return {
        price: licensePrice(q.bundle) || defaultLicensePrice(),
        itemId: null,
        personal: false,
        basis: "fallback" as const,
        basePrice: null,
      };
    }
    const basePrice = item.myPrice == null ? null : toNumber(item.myPrice);
    const base = { itemId: item.id, basePrice };

    // Личная цена дилера — высший приоритет, перекрывает всё.
    const own = personalById.get(item.id);
    if (own !== undefined) return { ...base, price: own, personal: true, basis: "personal" as const };

    const dealerPrice = applyAdjust(toNumber(item.price), kind, adjust);
    const clientPrice = item.clientPrice == null ? null : toNumber(item.clientPrice);

    // Субдилер (тариф CLIENT) всегда платит по клиентской цене.
    if (tier === "CLIENT" && clientPrice !== null) {
      return { ...base, price: clientPrice, personal: false, basis: "client_tier" as const };
    }

    // Все остальные, включая только что зарегистрированных, — по дилерской цене.
    return { ...base, price: dealerPrice, personal: false, basis: "dealer" as const };
  });
}

export async function resolvePrice(
  dealerId: string | null,
  query: PriceQuery,
): Promise<ResolvedPrice> {
  const [only] = await resolvePrices(dealerId, [query]);
  return only;
}

/** Подпись позиции: продукт, а за ним пакет и регион, если они есть. */
export function positionLabel(q: PriceQuery): string {
  return [q.product, q.bundle, q.region].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
}
