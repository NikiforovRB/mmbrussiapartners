/**
 * Импорт выгрузки старого ЛК DriveMods (scripts/drivemods-lk-export.ts) в
 * таблицы LegacyDealer (дилеры со статистикой) и LegacyRecord (каждая
 * лицензия, оплата, пароль, услуга) и полный XLSX.
 *
 * Дилеры старого ЛК бывают двух видов:
 *  - субдилеры со своей учёткой — выписывали лицензии сами;
 *  - клиенты общего кабинета — их лицензии выписывал владелец, а имя и город
 *    писал в комментарии («Ленар Казань»).
 * Группы комментариев сливаются с учёткой, если имя и город совпадают
 * однозначно. Учётки привязываются к дилерам портала по email или
 * телефону — такие дилеры отмечаются как «работал в старом ЛК».
 * Записи достаются дилеру, к которому привязан их дилер; поштучное
 * распределение администратора повторный импорт не меняет.
 *
 * Суммы — по дилерскому прайсу MMB RUSSIA (PriceListItem.price): в ЛК стоит
 * цена DriveMods для MMB RUSSIA, она сохраняется в priceLk. Лицензии CCNC,
 * CCIC и CCIC2 оплачиваются в самом DriveMods — их не импортируем, как и
 * оплаченные генерации за 0 ₽; оплаты пересчитываются без них.
 *
 *   npx tsx scripts/drivemods-lk-import.ts [файл.json] [--dry-run] [--out <папка>]
 *
 * Файл по умолчанию — самая свежая выгрузка в ../mmbrussia-exports. XLSX
 * пишется туда же: в нём персональные данные, в репозиторий его не кладём.
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { Prisma, PrismaClient } from "@prisma/client";

type LkUser = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  isActive: boolean | null;
  createdAt: string | null;
};

type PayItem = { id: string | null; sum: number | null; quantity: number | null };

type LkRecord = {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  type: number | null;
  licenseType: number | null;
  product: string | null;
  bundle: string | null;
  region: string | null;
  version: string | null;
  versionCustom: string | null;
  currency: number | null;
  priceBase: number | null;
  priceTotal: number | null;
  discount: number | null;
  discountName?: string | null;
  couponCode?: string | null;
  paymentStatus: number | null;
  dealerComment: string | null;
  recoverable?: boolean;
  eolType?: string | null;
  createdById: string | null;
  createdByName: string | null;
  /** Выгрузки до октября 2026 хранили здесь только число позиций. */
  payItems: PayItem[] | number | null;
  /** Сумма как в ЛК, до сопоставления с прайсом (заполняет prepareRecords). */
  priceLk?: number | null;
};

type LkExport = { fetchedAt: string; owner: LkUser; users: LkUser[]; records: LkRecord[] };

const RECORD_TYPES: Record<number, string> = {
  1: "Прочее",
  2: "Лицензия",
  3: "Услуга",
  4: "Оплата",
  5: "Внешняя оплата",
  7: "Комментарий",
  8: "Пароль",
};
const LICENSE_TYPES: Record<number, string> = { 1: "Генерация", 2: "Обновление", 3: "Восстановление" };
const PAYMENT_STATUSES: Record<number, string> = { 1: "Не оплачено", 2: "В процессе", 3: "Оплачено" };
const PAYMENT_STATUS_KEYS: Record<number, string> = { 1: "UNPAID", 2: "PENDING", 3: "PAID" };

type RecordKind = "LICENSE" | "PAYMENT" | "PASSWORD" | "SERVICE";
const recordKind = (type: number | null): RecordKind =>
  type === 2 ? "LICENSE" : type === 4 || type === 5 ? "PAYMENT" : type === 8 ? "PASSWORD" : "SERVICE";
const payItemsOf = (r: LkRecord): PayItem[] => (Array.isArray(r.payItems) ? r.payItems : []);
const isPayment = (r: LkRecord) => r.type === 4 || r.type === 5;
const isGeneration = (r: LkRecord) => r.type === 2 && r.licenseType === 1;

/** Оплачиваются в самом DriveMods, не у MMB RUSSIA. */
const EXCLUDED_PRODUCTS = ["CCNC", "CCIC", "CCIC2"];

type PriceItem = { product: string; bundle: string; region: string; price: number };

const upper = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/**
 * Дилерская цена позиции ЛК. В прайсе продукт бывает записан вместе с
 * комплектацией ЛК: «LG-GEN5 CUSTOM+RUS» — это LG-GEN5 / CUSTOM+RUS в ЛК.
 */
function dealerPriceFor(r: LkRecord, prices: PriceItem[]): number | null {
  const product = upper(r.product);
  const same = prices.filter((p) => p.product.split(" ")[0] === product);
  if (same.length <= 1) return same[0]?.price ?? null;
  const bundle = upper(r.bundle);
  const byBundle = same.filter((p) => p.bundle === bundle || p.product.slice(product.length).trim() === bundle);
  if (byBundle.length === 0) return null;
  const region = upper(r.region) || "RUS";
  return (byBundle.find((p) => p.region === region) ?? byBundle[0]).price;
}

/**
 * Убирает лицензии DriveMods и оплаченные генерации за 0 ₽, ставит дилерские
 * цены генерациям и пересчитывает оплаты по оставшимся позициям. Оплата, все
 * позиции которой убраны, убирается тоже.
 */
function prepareRecords(records: LkRecord[], prices: PriceItem[]) {
  const dropped = new Set(
    records
      .filter(
        (r) =>
          r.type === 2 &&
          (EXCLUDED_PRODUCTS.includes(upper(r.product)) ||
            (isGeneration(r) && r.paymentStatus === 3 && (r.priceTotal ?? 0) <= 0)),
      )
      .map((r) => r.id),
  );
  const priced = new Map<string, number>();
  for (const r of records) {
    if (dropped.has(r.id) || !isGeneration(r) || (r.priceTotal ?? 0) <= 0) continue;
    const price = dealerPriceFor(r, prices);
    if (price != null) priced.set(r.id, price);
  }
  const kept: LkRecord[] = [];
  for (const r of records) {
    if (dropped.has(r.id)) continue;
    const out: LkRecord = { ...r, priceLk: r.priceTotal, priceTotal: priced.get(r.id) ?? r.priceTotal };
    if (isPayment(r) && payItemsOf(r).length > 0) {
      const items = payItemsOf(r)
        .filter((it) => !it.id || !dropped.has(it.id))
        .map((it) => (it.id && priced.has(it.id) ? { ...it, sum: priced.get(it.id)! } : it));
      if (items.length === 0) {
        dropped.add(r.id);
        continue;
      }
      out.payItems = items;
      out.priceTotal = money(items.reduce((s, it) => s + (it.sum ?? 0), 0));
    }
    kept.push(out);
  }
  return { records: kept, dropped, priced: priced.size };
}
const COUNTRIES: Record<string, string> = {
  RU: "Россия",
  BY: "Беларусь",
  KZ: "Казахстан",
  AM: "Армения",
  KG: "Киргизия",
  UZ: "Узбекистан",
  AZ: "Азербайджан",
  GE: "Грузия",
  TJ: "Таджикистан",
  UA: "Украина",
};
/** Крупные города — чтобы в «Ленар Казань» отличить имя от города. */
const KNOWN_CITIES = [
  "москва", "санкт-петербург", "питер", "спб", "новосибирск", "екатеринбург", "казань", "нижний",
  "челябинск", "самара", "омск", "ростов", "уфа", "красноярск", "воронеж", "пермь", "волгоград",
  "краснодар", "саратов", "тюмень", "тольятти", "ижевск", "барнаул", "ульяновск", "иркутск",
  "хабаровск", "ярославль", "владивосток", "махачкала", "томск", "оренбург", "кемерово",
  "новокузнецк", "рязань", "астрахань", "набережные", "пенза", "липецк", "киров", "чебоксары",
  "тула", "калининград", "курск", "сочи", "ставрополь", "улан-удэ", "тверь", "магнитогорск",
  "иваново", "брянск", "белгород", "сургут", "владимир", "архангельск", "чита", "калуга",
  "смоленск", "волжский", "курган", "орел", "череповец", "вологда", "якутск", "саранск",
  "грозный", "мурманск", "тамбов", "кострома", "нальчик", "новороссийск", "сыктывкар",
  "нижневартовск", "стерлитамак", "петрозаводск", "йошкар-ола", "дербент", "геленджик",
  "анапа", "пятигорск", "минск", "алматы", "астана", "бишкек", "ташкент", "ереван", "баку",
  "уральск", "шымкент", "караганда", "гомель", "брест", "гродно", "витебск", "могилев", "ош",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const outIdx = args.indexOf("--out");
const outArg = outIdx >= 0 ? args[outIdx + 1] : null;
const fileArg = args.find((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));

function latestExport(): string {
  const dir = resolve(process.cwd(), "..", "mmbrussia-exports");
  const files = readdirSync(dir)
    .filter((f) => /^drivemods-lk-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) throw new Error(`В ${dir} нет выгрузок drivemods-lk-*.json`);
  return join(dir, files[files.length - 1]);
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const title = (s: string) =>
  s
    .split(/([\s-])/)
    .map((p) => (p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");

function phoneKey(raw?: string | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizedPhone(raw?: string | null): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 10 ? digits : null;
}

const NAMES = [
  "александр", "алексей", "альберт", "алик", "али", "алмаз", "анатолий", "анар", "андрей", "антон",
  "аркадий", "арсен", "артем", "артемий", "артур", "ахмед", "ашот", "азиз", "айдар", "борис",
  "вадим", "валентин", "валерий", "василий", "виктор", "виталий", "владимир", "владислав", "вячеслав",
  "гарик", "геворг", "геннадий", "георгий", "глеб", "грачик", "григорий", "давид", "даниил", "данил",
  "данир", "денис", "дмитрий", "евгений", "егор", "заур", "иван", "игорь", "ильдар", "ильяс", "илья",
  "ислам", "исломбек", "камиль", "кирилл", "константин", "ленар", "леонид", "магомед", "максим",
  "марат", "марк", "михаил", "мурат", "надир", "наиль", "нариман", "никита", "николай", "олег",
  "павел", "петр", "радик", "рагим", "рамиль", "рашид", "ренат", "ринат", "роман", "руслан", "рустам",
  "самвел", "семен", "сергей", "станислав", "степан", "тимофей", "тимур", "федор", "филипп", "хасан",
  "шамиль", "шамсутдин", "эдуард", "эльдар", "юрий", "ярослав",
];
const DIMINUTIVES: Record<string, string> = {
  юра: "юрий", саша: "александр", дима: "дмитрий", леша: "алексей", паша: "павел", миша: "михаил",
  женя: "евгений", сережа: "сергей", вова: "владимир", слава: "вячеслав", коля: "николай",
  костя: "константин", макс: "максим", ваня: "иван", азис: "азиз",
};
const CITY_ALIASES: Record<string, string> = {
  питер: "санкт-петербург", спб: "санкт-петербург", санкт: "санкт-петербург", петербург: "санкт-петербург",
  "санкт-петербург": "санкт-петербург", ростов: "ростов-на-дону", "ростов-на-дону": "ростов-на-дону",
  набережные: "набережные челны", нижний: "нижний новгород", екб: "екатеринбург", мск: "москва",
  минеральные: "минеральные воды",
};
const CITY_DISPLAY: Record<string, string> = {
  "санкт-петербург": "Санкт-Петербург",
  "ростов-на-дону": "Ростов-на-Дону",
  "набережные челны": "Набережные Челны",
  "нижний новгород": "Нижний Новгород",
  "минеральные воды": "Минеральные Воды",
};
/** Служебные слова из комментариев: «(Доставка)», «RESTORE», «Переход с ECO на FULL»… */
const STOP = new Set([
  "restore", "update", "доставка", "восстановление", "обновление", "переход", "повторная", "лицензия",
  "лицензии", "лицензию", "eco", "full", "dm", "после", "скидка", "для", "клиент", "клиента", "клиенту",
  "тест", "test", "тестовый", "тестовая", "бесплатно", "замена", "замены", "прошивки", "прошивка",
  "перепрошивка", "ремонт", "ремонта", "была", "был", "было", "там", "тыс", "участник", "группы",
  "не", "на", "от", "по", "из", "с", "и", "в", "к", "лк", "работал", "мили", "км",
]);

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function closest(t: string, pool: Iterable<string>, max: number): string | null {
  let best: string | null = null;
  let bestD = max + 1;
  for (const p of pool) {
    if (Math.abs(p.length - t.length) > max) continue;
    const d = levenshtein(t, p);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return bestD <= max ? best : null;
}

const similarCity = (a: string, b: string) =>
  (Math.min(a.length, b.length) >= 5 && a.slice(0, 5) === b.slice(0, 5)) ||
  (Math.min(a.length, b.length) >= 6 && levenshtein(a, b) <= 2);

const displayCity = (c: string) => CITY_DISPLAY[c] ?? title(c);

const money = (n: number) => Math.round(n * 100) / 100;

type Stats = {
  licenses: number;
  viaAccount: number;
  viaComment: number;
  paid: number;
  unpaid: number;
  amountTotal: number;
  amountPaid: number;
  amountUnpaid: number;
  first: string | null;
  last: string | null;
  payments: number;
  paymentsAmount: number;
  products: Map<string, { count: number; amount: number }>;
  comments: Map<string, number>;
};

const emptyStats = (): Stats => ({
  licenses: 0,
  viaAccount: 0,
  viaComment: 0,
  paid: 0,
  unpaid: 0,
  amountTotal: 0,
  amountPaid: 0,
  amountUnpaid: 0,
  first: null,
  last: null,
  payments: 0,
  paymentsAmount: 0,
  products: new Map(),
  comments: new Map(),
});

type Dealer = {
  externalKey: string;
  source: "account" | "comment";
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  registeredAt: string | null;
  active: boolean;
  stats: Stats;
};

function addLicense(d: Dealer, r: LkRecord, via: "account" | "comment") {
  const s = d.stats;
  const amount = r.priceTotal ?? 0;
  s.licenses++;
  if (via === "account") s.viaAccount++;
  else s.viaComment++;
  s.amountTotal += amount;
  if (r.paymentStatus === 3) {
    s.paid++;
    s.amountPaid += amount;
  } else {
    s.unpaid++;
    s.amountUnpaid += amount;
  }
  if (!s.first || r.createdAt < s.first) s.first = r.createdAt;
  if (!s.last || r.createdAt > s.last) s.last = r.createdAt;
  const position = [r.product, r.bundle, r.region].filter(Boolean).join(" ") || "—";
  const p = s.products.get(position) ?? { count: 0, amount: 0 };
  p.count++;
  p.amount += amount;
  s.products.set(position, p);
  const comment = (r.dealerComment ?? "").trim();
  if (comment) s.comments.set(comment, (s.comments.get(comment) ?? 0) + 1);
}

async function main() {
  const file = fileArg ? resolve(fileArg) : latestExport();
  const outDir = outArg ? resolve(outArg) : dirname(file);
  const data = JSON.parse(readFileSync(file, "utf8")) as LkExport;
  const ownerId = data.owner.id;
  console.log(`Выгрузка ${file}: ${data.users.length} учёток, ${data.records.length} записей`);

  const db = new PrismaClient();
  try {
    const prices: PriceItem[] = (
      await db.priceListItem.findMany({ select: { product: true, bundle: true, region: true, price: true } })
    ).map((p) => ({ product: upper(p.product), bundle: upper(p.bundle), region: upper(p.region), price: Number(p.price) }));
    const prepared = prepareRecords(data.records, prices);
    data.records = prepared.records;
    console.log(
      `Не импортируются (CCNC/CCIC, оплаченные генерации за 0 ₽ и их оплаты): ${prepared.dropped.size}; ` +
        `по дилерскому прайсу: ${prepared.priced} генераций`,
    );

    const portalCities = await db.dealerProfile.findMany({ select: { city: true } });
    const names = new Set<string>(NAMES);
    for (const u of data.users) {
      const first = norm(u.name).split(" ")[0];
      if (first && first.length > 2 && !/[a-z]/.test(first)) names.add(DIMINUTIVES[first] ?? first);
    }
    const cities = new Set<string>(KNOWN_CITIES);
    for (const c of [...portalCities.map((p) => p.city), ...data.users.map((u) => u.city)]) {
      const first = norm((c ?? "").split(",")[0]).split(" ")[0];
      if (first && first.length > 2 && !names.has(first)) cities.add(first);
    }
    const canonCity = (t: string) => CITY_ALIASES[t] ?? t;
    const classify = (t: string): { name?: string; city?: string } => {
      if (DIMINUTIVES[t]) return { name: DIMINUTIVES[t] };
      if (names.has(t)) return { name: t };
      if (CITY_ALIASES[t] || cities.has(t)) return { city: canonCity(t) };
      const name = t.length >= 5 ? closest(t, names, 1) : null;
      if (name) return { name };
      const city = t.length >= 5 ? closest(t, cities, 1) : null;
      return city ? { city: canonCity(city) } : {};
    };
    /** «(Доставка) Юра Питер» → юрий | санкт-петербург; «Юрий Денис Питер» — клиент Юрия. */
    const parseComment = (comment: string | null): string => {
      const tokens = norm(comment).split(" ").filter(Boolean).slice(0, 10);
      let name: string | null = null;
      let nameIdx = -1;
      let city: string | null = null;
      tokens.forEach((t, i) => {
        if (STOP.has(t) || /\d/.test(t)) return;
        const c = classify(t);
        if (c.name && !name) [name, nameIdx] = [c.name, i];
        else if (c.city && !city) city = c.city;
      });
      if (name && !city) {
        for (const j of [nameIdx + 1, nameIdx - 1]) {
          const t = tokens[j];
          if (t && !STOP.has(t) && /^[a-zа-я-]{3,}$/.test(t) && !classify(t).name) {
            city = t;
            break;
          }
        }
      }
      return `${name ?? ""}|${city ?? ""}`;
    };
    const personKey = (name: string | null, city: string | null) => {
      const n = norm(name).split(" ")[0];
      const c = norm((city ?? "").split(",")[0]).split(" ")[0];
      return n && c ? `${DIMINUTIVES[n] ?? n}|${canonCity(c)}` : null;
    };

    // 1. Учётки субдилеров.
    const dealers = new Map<string, Dealer>();
    const accounts = data.users.filter((u) => u.id !== ownerId);
    for (const u of accounts) {
      dealers.set(`acc:${u.id}`, {
        externalKey: `acc:${u.id}`,
        source: "account",
        name: (u.name ?? "").trim() || u.email || u.id,
        email: u.email?.trim().toLowerCase() || null,
        phone: normalizedPhone(u.phone),
        city: u.city?.trim() || null,
        country: u.country ? COUNTRIES[u.country] ?? u.country : null,
        registeredAt: u.createdAt,
        active: u.isActive !== false,
        stats: emptyStats(),
      });
    }
    const accountIndex = new Map<string, string[]>();
    for (const u of accounts) {
      const k = personKey(u.name, u.city);
      if (!k) continue;
      // «Рагим» без города — тоже он, если учётка с таким именем одна.
      for (const key of [k, `${k.split("|")[0]}|`]) accountIndex.set(key, [...(accountIndex.get(key) ?? []), `acc:${u.id}`]);
    }
    const ownerKey = personKey(data.owner.name, data.owner.city);

    // 2. Лицензии: свои у учёток, из общего кабинета — по комментарию.
    const licenses = data.records.filter((r) => r.type === 2);
    const ownAccount = (r: LkRecord) =>
      r.createdById && r.createdById !== ownerId ? dealers.get(`acc:${r.createdById}`) : undefined;
    const parsed = new Map<string, string>();
    const groupSizes = new Map<string, number>();
    for (const r of licenses) {
      if (ownAccount(r)) continue;
      const k = parseComment(r.dealerComment);
      parsed.set(r.id, k);
      groupSizes.set(k, (groupSizes.get(k) ?? 0) + 1);
    }
    // Варианты написания незнакомого города («Каменск», «Каминск-Шахтинск») — к самой крупной группе.
    const knownCities = new Set([...cities, ...Object.values(CITY_ALIASES)]);
    const bySize = [...groupSizes.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const canonical = new Map<string, string>();
    bySize.forEach((k, i) => {
      const [name, city] = k.split("|");
      if (!name || !city || knownCities.has(city)) return;
      const target = bySize.slice(0, i).find((bigger) => {
        const [n2, c2] = bigger.split("|");
        return n2 === name && c2 && similarCity(city, c2);
      });
      if (target) canonical.set(k, canonical.get(target) ?? target);
    });

    const attributed = new Map<string, string>();
    /** Запись ЛК → externalKey дилера старого ЛК. */
    const dealerOf = new Map<string, string>();
    for (const r of licenses) {
      const own = ownAccount(r);
      if (own) {
        addLicense(own, r, "account");
        attributed.set(r.id, own.name);
        dealerOf.set(r.id, own.externalKey);
        continue;
      }
      const raw = parsed.get(r.id)!;
      const k = canonical.get(raw) ?? raw;
      const accs = accountIndex.get(k);
      if (accs?.length === 1) {
        const account = dealers.get(accs[0])!;
        addLicense(account, r, "comment");
        attributed.set(r.id, account.name);
        dealerOf.set(r.id, account.externalKey);
        continue;
      }
      const key = `cmt:${k}`;
      let d = dealers.get(key);
      if (!d) {
        const [n, c] = k.split("|");
        let name = n ? title(n) : c ? "Имя не указано" : "Не указан в комментарии";
        if (k === ownerKey) name = `${name} (MMB RUSSIA, свои продажи)`;
        d = {
          externalKey: key,
          source: "comment",
          name,
          email: null,
          phone: null,
          city: c ? displayCity(c) : null,
          country: null,
          registeredAt: null,
          active: true,
          stats: emptyStats(),
        };
        dealers.set(key, d);
      }
      addLicense(d, r, "comment");
      attributed.set(r.id, d.city ? `${d.name}, ${d.city}` : d.name);
      dealerOf.set(r.id, d.externalKey);
    }

    // 3. Оплаты. Из учётки — её владельцу; внешние (их вносил владелец ЛК) —
    // дилеру, чьи лицензии они погасили, по большей сумме.
    const payments = data.records.filter((r) => r.type === 4 || r.type === 5);
    const paidBy = new Map<string, string>();
    for (const r of payments) {
      for (const it of payItemsOf(r)) if (it.id && !paidBy.has(it.id)) paidBy.set(it.id, r.id);
      let key = ownAccount(r)?.externalKey ?? null;
      if (!key) {
        const weight = new Map<string, number>();
        for (const it of payItemsOf(r)) {
          const k = it.id ? dealerOf.get(it.id) : undefined;
          if (k) weight.set(k, (weight.get(k) ?? 0) + (it.sum ?? 1));
        }
        key = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }
      if (!key) continue;
      dealerOf.set(r.id, key);
      if (r.paymentStatus !== 3) continue;
      const d = dealers.get(key)!;
      d.stats.payments++;
      d.stats.paymentsAmount += r.priceTotal ?? 0;
    }

    // 4. Пароли, услуги, купоны: учётка автора либо уже известный дилер из комментария.
    for (const r of data.records) {
      if (r.type === 2 || r.type === 4 || r.type === 5) continue;
      const own = ownAccount(r);
      if (own) {
        dealerOf.set(r.id, own.externalKey);
        continue;
      }
      const raw = parseComment(r.dealerComment);
      if (raw === "|") continue;
      const k = canonical.get(raw) ?? raw;
      const accs = accountIndex.get(k);
      const key = accs?.length === 1 ? accs[0] : dealers.has(`cmt:${k}`) ? `cmt:${k}` : null;
      if (key) dealerOf.set(r.id, key);
    }

    const list = [...dealers.values()].sort((a, b) => b.stats.licenses - a.stats.licenses);
    const byAccount = list.filter((d) => d.source === "account").length;
    console.log(
      `Дилеров: ${list.length} (учёток ${byAccount}, по комментариям ${list.length - byAccount}); ` +
        `лицензий ${licenses.length}, оплат ${payments.length}, ` +
        `записей с дилером ${dealerOf.size} из ${data.records.length}`,
    );

    // 5. Привязка к дилерам портала: email, затем телефон.
    const portal = await db.user.findMany({
      where: { dealerProfile: { isNot: null } },
      select: { id: true, email: true, dealerProfile: { select: { phone: true } } },
    });
    const portalByEmail = new Map(portal.map((u) => [u.email.toLowerCase(), u.id]));
    const portalByPhone = new Map<string, string[]>();
    for (const u of portal) {
      const k = phoneKey(u.dealerProfile?.phone);
      if (k) portalByPhone.set(k, [...(portalByPhone.get(k) ?? []), u.id]);
    }
    const links = new Map<string, string>();
    for (const d of list) {
      if (d.source !== "account") continue;
      const byEmail = d.email ? portalByEmail.get(d.email) : undefined;
      const byPhone = portalByPhone.get(phoneKey(d.phone) ?? "") ?? [];
      const userId = byEmail ?? (byPhone.length === 1 ? byPhone[0] : undefined);
      if (userId && ![...links.values()].includes(userId)) links.set(d.externalKey, userId);
    }
    console.log(`Совпало с дилерами портала: ${links.size}`);

    // 6. База.
    if (!dryRun) {
      const existing = await db.legacyDealer.findMany({ select: { externalKey: true, userId: true } });
      const manual = new Map(existing.filter((e) => e.userId).map((e) => [e.externalKey, e.userId!]));
      const importedAt = new Date();
      for (const d of list) {
        const s = d.stats;
        const payload = {
          source: d.source,
          name: d.name,
          email: d.email,
          phone: d.phone,
          city: d.city,
          country: d.country,
          registeredAt: d.registeredAt ? new Date(d.registeredAt) : null,
          active: d.active,
          licenses: s.licenses,
          viaAccount: s.viaAccount,
          viaComment: s.viaComment,
          paidLicenses: s.paid,
          unpaidLicenses: s.unpaid,
          amountTotal: new Prisma.Decimal(money(s.amountTotal)),
          amountPaid: new Prisma.Decimal(money(s.amountPaid)),
          amountUnpaid: new Prisma.Decimal(money(s.amountUnpaid)),
          firstLicenseAt: s.first ? new Date(s.first) : null,
          lastLicenseAt: s.last ? new Date(s.last) : null,
          payments: s.payments,
          paymentsAmount: new Prisma.Decimal(money(s.paymentsAmount)),
          products: [...s.products.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20)
            .map(([position, v]) => ({ position, count: v.count, amount: money(v.amount) })),
          comments: [...s.comments.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([text, count]) => ({ text, count })),
          importedAt,
        };
        // Ручную привязку администратора импорт не перетирает.
        const userId = manual.get(d.externalKey) ?? links.get(d.externalKey) ?? null;
        const taken = userId
          ? await db.legacyDealer.findFirst({
              where: { userId, externalKey: { not: d.externalKey } },
              select: { id: true },
            })
          : null;
        await db.legacyDealer.upsert({
          where: { externalKey: d.externalKey },
          create: { externalKey: d.externalKey, ...payload, userId: taken ? null : userId },
          update: { ...payload, ...(userId && !taken ? { userId } : {}) },
        });
      }
      const keys = list.map((d) => d.externalKey);
      const removed = await db.legacyDealer.deleteMany({ where: { externalKey: { notIn: keys }, userId: null } });

      const purged = await db.legacyRecord.deleteMany({
        where: {
          OR: [
            { id: { in: [...prepared.dropped] } },
            { kind: "LICENSE", product: { in: EXCLUDED_PRODUCTS } },
            {
              kind: "LICENSE",
              licenseType: LICENSE_TYPES[1],
              paymentStatus: "PAID",
              priceTotal: { lte: 0 },
              manualPayment: false,
            },
          ],
        },
      });
      console.log(`Удалено записей ЛК (CCNC/CCIC, оплаченные за 0 ₽ и их оплаты): ${purged.count}`);

      // Записи ЛК поштучно. Пропавшие из ЛК не удаляем — это история.
      const dealerIds = new Map(
        (await db.legacyDealer.findMany({ select: { id: true, externalKey: true } })).map((x) => [x.externalKey, x.id]),
      );
      const decimal = (n: number | null) => (n == null ? null : new Prisma.Decimal(money(n)));
      const rows = data.records.map((r) => {
        const kind = recordKind(r.type);
        return {
          id: r.id,
          kind,
          lkType: r.type ?? 0,
          createdAt: new Date(r.createdAt),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : null,
          licenseType: r.licenseType ? (LICENSE_TYPES[r.licenseType] ?? String(r.licenseType)) : null,
          product: r.product,
          bundle: r.bundle,
          region: r.region,
          version: r.version,
          versionCustom: r.versionCustom,
          eolType: r.eolType ?? null,
          recoverable: r.recoverable === true,
          priceBase: decimal(r.priceBase),
          priceTotal: decimal(r.priceTotal),
          priceLk: decimal(r.priceLk ?? null),
          discount: decimal(r.discount),
          discountName: r.discountName ?? null,
          couponCode: r.couponCode ?? null,
          paymentStatus: PAYMENT_STATUS_KEYS[r.paymentStatus ?? 1] ?? "UNPAID",
          dealerComment: r.dealerComment?.trim() || null,
          authorId: r.createdById,
          authorName: r.createdByName,
          paidById: paidBy.get(r.id) ?? null,
          paidItems: kind === "PAYMENT" ? payItemsOf(r).length : null,
          legacyDealerId: dealerIds.get(dealerOf.get(r.id) ?? "") ?? null,
          importedAt,
        };
      });
      type Comparable = Pick<
        (typeof rows)[number],
        | "updatedAt"
        | "paymentStatus"
        | "priceTotal"
        | "priceLk"
        | "dealerComment"
        | "legacyDealerId"
        | "paidById"
        | "paidItems"
      >;
      const amount = (n: Prisma.Decimal | null) => (n == null ? "" : Number(n).toFixed(2));
      const signature = (x: Comparable) =>
        [
          x.updatedAt?.toISOString() ?? "",
          x.paymentStatus,
          amount(x.priceTotal),
          amount(x.priceLk),
          x.dealerComment ?? "",
          x.legacyDealerId ?? "",
          x.paidById ?? "",
          x.paidItems ?? "",
        ].join("\u0001");
      const stored = new Map(
        (
          await db.legacyRecord.findMany({
            select: {
              id: true,
              updatedAt: true,
              paymentStatus: true,
              priceTotal: true,
              priceLk: true,
              dealerComment: true,
              legacyDealerId: true,
              paidById: true,
              paidItems: true,
              manualPayment: true,
            },
          })
        ).map((x) => [x.id, x]),
      );
      const fresh = rows.filter((r) => !stored.has(r.id));
      for (let i = 0; i < fresh.length; i += 1000) {
        await db.legacyRecord.createMany({ data: fresh.slice(i, i + 1000), skipDuplicates: true });
      }
      // Оплату, отмеченную администратором портала, импорт не перезаписывает.
      const changed = rows.flatMap((r) => {
        const s = stored.get(r.id);
        if (!s) return [];
        const row = s.manualPayment ? { ...r, paymentStatus: s.paymentStatus, priceTotal: s.priceTotal } : r;
        return signature(row) !== signature(s) ? [row] : [];
      });
      for (const { id, ...row } of changed) await db.legacyRecord.update({ where: { id }, data: row });
      // Владелец на портале — от привязки дилера старого ЛК, кроме назначенных вручную.
      const owners = await db.$executeRaw`
        UPDATE "LegacyRecord" r SET "userId" = d."userId"
        FROM "LegacyDealer" d
        WHERE r."legacyDealerId" = d."id" AND NOT r."manualAssign" AND r."userId" IS DISTINCT FROM d."userId"`;
      const orphaned = await db.$executeRaw`
        UPDATE "LegacyRecord" SET "userId" = NULL
        WHERE "legacyDealerId" IS NULL AND NOT "manualAssign" AND "userId" IS NOT NULL`;
      console.log(
        `Записи ЛК: новых ${fresh.length}, изменилось ${changed.length}, сменили владельца ${owners + orphaned}`,
      );

      const linkedUsers = [
        ...(await db.legacyDealer.findMany({ where: { userId: { not: null } }, select: { userId: true } })),
        ...(await db.legacyRecord.findMany({
          where: { manualAssign: true, userId: { not: null } },
          distinct: ["userId"],
          select: { userId: true },
        })),
      ]
        .map((l) => l.userId!)
        .filter(Boolean);
      const flagged = await db.dealerProfile.updateMany({
        where: { userId: { in: linkedUsers }, legacyDealer: false },
        data: { legacyDealer: true },
      });
      console.log(`База: записей ${list.length}, удалено устаревших ${removed.count}, отмечено «старый ЛК» ${flagged.count}`);
    } else {
      console.log("--dry-run: база не менялась");
    }

    // 7. XLSX.
    const portalEmail = new Map(portal.map((u) => [u.id, u.email]));
    const stamp = data.fetchedAt.slice(0, 10);
    const xlsxPath = join(outDir, `drivemods-lk-dealers-${stamp}.xlsx`);
    const wb = new ExcelJS.Workbook();
    wb.creator = "MMB RUSSIA Partners";
    wb.created = new Date();
    const moneyFmt = '#,##0.00 "₽"';
    const dateFmt = "dd.mm.yyyy hh:mm";

    const wsDealers = wb.addWorksheet("Дилеры", { views: [{ state: "frozen", ySplit: 1 }] });
    wsDealers.columns = [
      { header: "Дилер", key: "name", width: 26 },
      { header: "Источник", key: "source", width: 14 },
      { header: "Email", key: "email", width: 28 },
      { header: "Телефон", key: "phone", width: 16 },
      { header: "Город", key: "city", width: 18 },
      { header: "Страна", key: "country", width: 12 },
      { header: "Учётка с", key: "registeredAt", width: 18, style: { numFmt: dateFmt } },
      { header: "Лицензий", key: "licenses", width: 10 },
      { header: "Из своей учётки", key: "viaAccount", width: 12 },
      { header: "Из общего кабинета", key: "viaComment", width: 12 },
      { header: "Оплачено шт.", key: "paid", width: 12 },
      { header: "Не оплачено шт.", key: "unpaid", width: 12 },
      { header: "Сумма", key: "amountTotal", width: 14, style: { numFmt: moneyFmt } },
      { header: "Оплачено", key: "amountPaid", width: 14, style: { numFmt: moneyFmt } },
      { header: "Не оплачено", key: "amountUnpaid", width: 14, style: { numFmt: moneyFmt } },
      { header: "Пополнений", key: "payments", width: 12 },
      { header: "Пополнено", key: "paymentsAmount", width: 14, style: { numFmt: moneyFmt } },
      { header: "Первая лицензия", key: "first", width: 18, style: { numFmt: dateFmt } },
      { header: "Последняя лицензия", key: "last", width: 18, style: { numFmt: dateFmt } },
      { header: "Дилер на портале", key: "portal", width: 28 },
    ];
    for (const d of list) {
      const s = d.stats;
      const userId = links.get(d.externalKey);
      wsDealers.addRow({
        name: d.city && d.source === "comment" ? `${d.name}, ${d.city}` : d.name,
        source: d.source === "account" ? "Учётка ЛК" : "Комментарий",
        email: d.email,
        phone: d.phone ? `+${d.phone}` : null,
        city: d.city,
        country: d.country,
        registeredAt: d.registeredAt ? new Date(d.registeredAt) : null,
        licenses: s.licenses,
        viaAccount: s.viaAccount,
        viaComment: s.viaComment,
        paid: s.paid,
        unpaid: s.unpaid,
        amountTotal: money(s.amountTotal),
        amountPaid: money(s.amountPaid),
        amountUnpaid: money(s.amountUnpaid),
        payments: s.payments,
        paymentsAmount: money(s.paymentsAmount),
        first: s.first ? new Date(s.first) : null,
        last: s.last ? new Date(s.last) : null,
        portal: userId ? portalEmail.get(userId) : null,
      });
    }
    wsDealers.getRow(1).font = { bold: true };
    wsDealers.autoFilter = { from: "A1", to: "T1" };

    const wsPositions = wb.addWorksheet("Позиции", { views: [{ state: "frozen", ySplit: 1 }] });
    wsPositions.columns = [
      { header: "Дилер", key: "dealer", width: 28 },
      { header: "Позиция", key: "position", width: 34 },
      { header: "Лицензий", key: "count", width: 10 },
      { header: "Сумма", key: "amount", width: 14, style: { numFmt: moneyFmt } },
    ];
    for (const d of list) {
      for (const [position, v] of [...d.stats.products.entries()].sort((a, b) => b[1].count - a[1].count)) {
        wsPositions.addRow({
          dealer: d.city && d.source === "comment" ? `${d.name}, ${d.city}` : d.name,
          position,
          count: v.count,
          amount: money(v.amount),
        });
      }
    }
    wsPositions.getRow(1).font = { bold: true };

    const wsLicenses = wb.addWorksheet("Лицензии", { views: [{ state: "frozen", ySplit: 1 }] });
    wsLicenses.columns = [
      { header: "Дата", key: "date", width: 18, style: { numFmt: dateFmt } },
      { header: "Дилер", key: "dealer", width: 26 },
      { header: "Выписал", key: "createdBy", width: 22 },
      { header: "Тип", key: "licenseType", width: 16 },
      { header: "Продукт", key: "product", width: 20 },
      { header: "Комплектация", key: "bundle", width: 16 },
      { header: "Регион", key: "region", width: 10 },
      { header: "Версия ПО", key: "version", width: 26 },
      { header: "Версия кастома", key: "versionCustom", width: 14 },
      { header: "Базовая цена ЛК", key: "priceBase", width: 14, style: { numFmt: moneyFmt } },
      { header: "Скидка ЛК", key: "discount", width: 10 },
      { header: "Итого в ЛК", key: "priceLk", width: 14, style: { numFmt: moneyFmt } },
      { header: "Дилерская цена", key: "priceTotal", width: 14, style: { numFmt: moneyFmt } },
      { header: "Оплата", key: "payment", width: 14 },
      { header: "Комментарий дилера", key: "comment", width: 34 },
    ];
    for (const r of [...licenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      wsLicenses.addRow({
        date: new Date(r.createdAt),
        dealer: attributed.get(r.id) ?? "",
        createdBy: r.createdByName,
        licenseType: r.licenseType ? LICENSE_TYPES[r.licenseType] ?? r.licenseType : "",
        product: r.product,
        bundle: r.bundle,
        region: r.region,
        version: r.version,
        versionCustom: r.versionCustom,
        priceBase: r.priceBase,
        discount: r.discount,
        priceLk: r.priceLk,
        priceTotal: r.priceTotal,
        payment: r.paymentStatus ? PAYMENT_STATUSES[r.paymentStatus] ?? r.paymentStatus : "",
        comment: r.dealerComment,
      });
    }
    wsLicenses.getRow(1).font = { bold: true };
    wsLicenses.autoFilter = { from: "A1", to: "O1" };

    const wsOther = wb.addWorksheet("Оплаты и прочее", { views: [{ state: "frozen", ySplit: 1 }] });
    wsOther.columns = [
      { header: "Дата", key: "date", width: 18, style: { numFmt: dateFmt } },
      { header: "Тип записи", key: "type", width: 16 },
      { header: "Дилер", key: "dealer", width: 26 },
      { header: "Автор", key: "createdBy", width: 24 },
      { header: "Сумма", key: "amount", width: 14, style: { numFmt: moneyFmt } },
      { header: "Статус", key: "status", width: 14 },
      { header: "Позиций", key: "payItems", width: 10 },
      { header: "Комментарий", key: "comment", width: 34 },
    ];
    const dealerLabel = (recordId: string) => {
      const d = dealers.get(dealerOf.get(recordId) ?? "");
      return d ? (d.city && d.source === "comment" ? `${d.name}, ${d.city}` : d.name) : "";
    };
    for (const r of data.records.filter((x) => x.type !== 2 && x.type !== 8)) {
      wsOther.addRow({
        date: new Date(r.createdAt),
        type: r.type ? RECORD_TYPES[r.type] ?? r.type : "",
        dealer: dealerLabel(r.id),
        createdBy: r.createdByName,
        amount: r.priceTotal,
        status: r.paymentStatus ? PAYMENT_STATUSES[r.paymentStatus] ?? r.paymentStatus : "",
        payItems: Array.isArray(r.payItems) ? r.payItems.length : r.payItems,
        comment: r.dealerComment,
      });
    }
    wsOther.getRow(1).font = { bold: true };

    await wb.xlsx.writeFile(xlsxPath);
    console.log(`XLSX: ${xlsxPath}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
