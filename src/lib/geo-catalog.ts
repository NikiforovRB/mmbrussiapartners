/**
 * Справочник стран и регионов для местоположения дилера. Страна и
 * регион выбираются из списка, чтобы в базе и в «Дилерской сети» на сайте не
 * копились «Свердловская обл.», «Свердловская область» и «Екатеринбург» в поле
 * региона. Коды — ISO 3166: по ним сопоставляется ответ гео-сервиса.
 */

export type Country = { code: string; name: string; aliases?: string[] };
export type Region = { code: string; name: string };

/** Страна по умолчанию: пустое поле страны на сайте и в отчётах — Россия. */
export const DEFAULT_COUNTRY = "Россия";

/** Сначала страны, где работает сеть, затем остальные по алфавиту. */
const PRIORITY: Country[] = [
  { code: "RU", name: "Россия", aliases: ["Российская Федерация", "Russia"] },
  { code: "BY", name: "Беларусь", aliases: ["Белоруссия", "Belarus"] },
  { code: "KZ", name: "Казахстан", aliases: ["Kazakhstan"] },
  { code: "KG", name: "Киргизия", aliases: ["Кыргызстан", "Kyrgyzstan"] },
  { code: "UZ", name: "Узбекистан", aliases: ["Uzbekistan"] },
  { code: "AM", name: "Армения", aliases: ["Armenia"] },
  { code: "AZ", name: "Азербайджан", aliases: ["Azerbaijan"] },
  { code: "GE", name: "Грузия", aliases: ["Georgia"] },
  { code: "TJ", name: "Таджикистан", aliases: ["Tajikistan"] },
  { code: "TM", name: "Туркменистан", aliases: ["Туркмения", "Turkmenistan"] },
  { code: "MD", name: "Молдова", aliases: ["Молдавия", "Moldova"] },
  { code: "MN", name: "Монголия", aliases: ["Mongolia"] },
];

const OTHERS: Country[] = [
  { code: "AU", name: "Австралия" },
  { code: "AT", name: "Австрия" },
  { code: "AL", name: "Албания" },
  { code: "DZ", name: "Алжир" },
  { code: "AO", name: "Ангола" },
  { code: "AD", name: "Андорра" },
  { code: "AR", name: "Аргентина" },
  { code: "AF", name: "Афганистан" },
  { code: "BD", name: "Бангладеш" },
  { code: "BH", name: "Бахрейн" },
  { code: "BE", name: "Бельгия" },
  { code: "BG", name: "Болгария" },
  { code: "BO", name: "Боливия" },
  { code: "BA", name: "Босния и Герцеговина" },
  { code: "BR", name: "Бразилия" },
  { code: "GB", name: "Великобритания", aliases: ["Соединённое Королевство", "United Kingdom"] },
  { code: "HU", name: "Венгрия" },
  { code: "VE", name: "Венесуэла" },
  { code: "VN", name: "Вьетнам" },
  { code: "DE", name: "Германия" },
  { code: "HK", name: "Гонконг" },
  { code: "GR", name: "Греция" },
  { code: "DK", name: "Дания" },
  { code: "DO", name: "Доминиканская Республика" },
  { code: "EG", name: "Египет" },
  { code: "IL", name: "Израиль" },
  { code: "IN", name: "Индия" },
  { code: "ID", name: "Индонезия" },
  { code: "JO", name: "Иордания" },
  { code: "IQ", name: "Ирак" },
  { code: "IR", name: "Иран" },
  { code: "IE", name: "Ирландия" },
  { code: "IS", name: "Исландия" },
  { code: "ES", name: "Испания" },
  { code: "IT", name: "Италия" },
  { code: "KH", name: "Камбоджа" },
  { code: "CA", name: "Канада" },
  { code: "QA", name: "Катар" },
  { code: "KE", name: "Кения" },
  { code: "CY", name: "Кипр" },
  { code: "CN", name: "Китай" },
  { code: "CO", name: "Колумбия" },
  { code: "KR", name: "Республика Корея", aliases: ["Южная Корея", "Корея"] },
  { code: "KP", name: "КНДР", aliases: ["Северная Корея"] },
  { code: "CR", name: "Коста-Рика" },
  { code: "CU", name: "Куба" },
  { code: "KW", name: "Кувейт" },
  { code: "LA", name: "Лаос" },
  { code: "LV", name: "Латвия" },
  { code: "LB", name: "Ливан" },
  { code: "LY", name: "Ливия" },
  { code: "LT", name: "Литва" },
  { code: "LI", name: "Лихтенштейн" },
  { code: "LU", name: "Люксембург" },
  { code: "MY", name: "Малайзия" },
  { code: "MV", name: "Мальдивы" },
  { code: "MT", name: "Мальта" },
  { code: "MA", name: "Марокко" },
  { code: "MX", name: "Мексика" },
  { code: "MC", name: "Монако" },
  { code: "MM", name: "Мьянма" },
  { code: "NP", name: "Непал" },
  { code: "NG", name: "Нигерия" },
  { code: "NL", name: "Нидерланды", aliases: ["Голландия"] },
  { code: "NZ", name: "Новая Зеландия" },
  { code: "NO", name: "Норвегия" },
  { code: "AE", name: "ОАЭ", aliases: ["Объединённые Арабские Эмираты"] },
  { code: "OM", name: "Оман" },
  { code: "PK", name: "Пакистан" },
  { code: "PA", name: "Панама" },
  { code: "PY", name: "Парагвай" },
  { code: "PE", name: "Перу" },
  { code: "PL", name: "Польша" },
  { code: "PT", name: "Португалия" },
  { code: "RO", name: "Румыния" },
  { code: "SA", name: "Саудовская Аравия" },
  { code: "MK", name: "Северная Македония" },
  { code: "RS", name: "Сербия" },
  { code: "SG", name: "Сингапур" },
  { code: "SY", name: "Сирия" },
  { code: "SK", name: "Словакия" },
  { code: "SI", name: "Словения" },
  { code: "US", name: "США", aliases: ["Соединённые Штаты"] },
  { code: "TH", name: "Таиланд" },
  { code: "TW", name: "Тайвань" },
  { code: "TN", name: "Тунис" },
  { code: "TR", name: "Турция" },
  { code: "UA", name: "Украина" },
  { code: "UY", name: "Уругвай" },
  { code: "PH", name: "Филиппины" },
  { code: "FI", name: "Финляндия" },
  { code: "FR", name: "Франция" },
  { code: "HR", name: "Хорватия" },
  { code: "ME", name: "Черногория" },
  { code: "CZ", name: "Чехия" },
  { code: "CL", name: "Чили" },
  { code: "CH", name: "Швейцария" },
  { code: "SE", name: "Швеция" },
  { code: "LK", name: "Шри-Ланка" },
  { code: "EC", name: "Эквадор" },
  { code: "EE", name: "Эстония" },
  { code: "ZA", name: "ЮАР" },
  { code: "JP", name: "Япония" },
];

export const COUNTRIES: Country[] = [...PRIORITY, ...OTHERS];

const RU_REGIONS: Region[] = [
  { code: "MOW", name: "Москва" },
  { code: "SPE", name: "Санкт-Петербург" },
  { code: "SEV", name: "Севастополь" },
  { code: "AD", name: "Республика Адыгея" },
  { code: "AL", name: "Республика Алтай" },
  { code: "BA", name: "Республика Башкортостан" },
  { code: "BU", name: "Республика Бурятия" },
  { code: "DA", name: "Республика Дагестан" },
  { code: "DON", name: "Донецкая Народная Республика" },
  { code: "IN", name: "Республика Ингушетия" },
  { code: "KB", name: "Кабардино-Балкарская Республика" },
  { code: "KL", name: "Республика Калмыкия" },
  { code: "KC", name: "Карачаево-Черкесская Республика" },
  { code: "KR", name: "Республика Карелия" },
  { code: "KO", name: "Республика Коми" },
  { code: "CR", name: "Республика Крым" },
  { code: "LUG", name: "Луганская Народная Республика" },
  { code: "ME", name: "Республика Марий Эл" },
  { code: "MO", name: "Республика Мордовия" },
  { code: "SA", name: "Республика Саха (Якутия)" },
  { code: "SE", name: "Республика Северная Осетия — Алания" },
  { code: "TA", name: "Республика Татарстан" },
  { code: "TY", name: "Республика Тыва" },
  { code: "UD", name: "Удмуртская Республика" },
  { code: "KK", name: "Республика Хакасия" },
  { code: "CE", name: "Чеченская Республика" },
  { code: "CU", name: "Чувашская Республика" },
  { code: "ALT", name: "Алтайский край" },
  { code: "ZAB", name: "Забайкальский край" },
  { code: "KAM", name: "Камчатский край" },
  { code: "KDA", name: "Краснодарский край" },
  { code: "KYA", name: "Красноярский край" },
  { code: "PER", name: "Пермский край" },
  { code: "PRI", name: "Приморский край" },
  { code: "STA", name: "Ставропольский край" },
  { code: "KHA", name: "Хабаровский край" },
  { code: "AMU", name: "Амурская область" },
  { code: "ARK", name: "Архангельская область" },
  { code: "AST", name: "Астраханская область" },
  { code: "BEL", name: "Белгородская область" },
  { code: "BRY", name: "Брянская область" },
  { code: "VLA", name: "Владимирская область" },
  { code: "VGG", name: "Волгоградская область" },
  { code: "VLG", name: "Вологодская область" },
  { code: "VOR", name: "Воронежская область" },
  { code: "ZAP", name: "Запорожская область" },
  { code: "IVA", name: "Ивановская область" },
  { code: "IRK", name: "Иркутская область" },
  { code: "KGD", name: "Калининградская область" },
  { code: "KLU", name: "Калужская область" },
  { code: "KEM", name: "Кемеровская область — Кузбасс" },
  { code: "KIR", name: "Кировская область" },
  { code: "KOS", name: "Костромская область" },
  { code: "KGN", name: "Курганская область" },
  { code: "KRS", name: "Курская область" },
  { code: "LEN", name: "Ленинградская область" },
  { code: "LIP", name: "Липецкая область" },
  { code: "MAG", name: "Магаданская область" },
  { code: "MOS", name: "Московская область" },
  { code: "MUR", name: "Мурманская область" },
  { code: "NIZ", name: "Нижегородская область" },
  { code: "NGR", name: "Новгородская область" },
  { code: "NVS", name: "Новосибирская область" },
  { code: "OMS", name: "Омская область" },
  { code: "ORE", name: "Оренбургская область" },
  { code: "ORL", name: "Орловская область" },
  { code: "PNZ", name: "Пензенская область" },
  { code: "PSK", name: "Псковская область" },
  { code: "ROS", name: "Ростовская область" },
  { code: "RYA", name: "Рязанская область" },
  { code: "SAM", name: "Самарская область" },
  { code: "SAR", name: "Саратовская область" },
  { code: "SAK", name: "Сахалинская область" },
  { code: "SVE", name: "Свердловская область" },
  { code: "SMO", name: "Смоленская область" },
  { code: "TAM", name: "Тамбовская область" },
  { code: "TVE", name: "Тверская область" },
  { code: "TOM", name: "Томская область" },
  { code: "TUL", name: "Тульская область" },
  { code: "TYU", name: "Тюменская область" },
  { code: "ULY", name: "Ульяновская область" },
  { code: "KHE", name: "Херсонская область" },
  { code: "CHE", name: "Челябинская область" },
  { code: "YAR", name: "Ярославская область" },
  { code: "YEV", name: "Еврейская автономная область" },
  { code: "NEN", name: "Ненецкий автономный округ" },
  { code: "KHM", name: "Ханты-Мансийский автономный округ — Югра" },
  { code: "CHU", name: "Чукотский автономный округ" },
  { code: "YAN", name: "Ямало-Ненецкий автономный округ" },
];

const BY_REGIONS: Region[] = [
  { code: "HM", name: "Минск" },
  { code: "BR", name: "Брестская область" },
  { code: "VI", name: "Витебская область" },
  { code: "HO", name: "Гомельская область" },
  { code: "HR", name: "Гродненская область" },
  { code: "MI", name: "Минская область" },
  { code: "MA", name: "Могилёвская область" },
];

const KZ_REGIONS: Region[] = [
  { code: "71", name: "Астана" },
  { code: "75", name: "Алматы" },
  { code: "79", name: "Шымкент" },
  { code: "10", name: "Абайская область" },
  { code: "11", name: "Акмолинская область" },
  { code: "15", name: "Актюбинская область" },
  { code: "19", name: "Алматинская область" },
  { code: "23", name: "Атырауская область" },
  { code: "63", name: "Восточно-Казахстанская область" },
  { code: "31", name: "Жамбылская область" },
  { code: "33", name: "Жетысуская область" },
  { code: "27", name: "Западно-Казахстанская область" },
  { code: "35", name: "Карагандинская область" },
  { code: "39", name: "Костанайская область" },
  { code: "43", name: "Кызылординская область" },
  { code: "47", name: "Мангистауская область" },
  { code: "55", name: "Павлодарская область" },
  { code: "59", name: "Северо-Казахстанская область" },
  { code: "61", name: "Туркестанская область" },
  { code: "62", name: "Улытауская область" },
];

const KG_REGIONS: Region[] = [
  { code: "GB", name: "Бишкек" },
  { code: "GO", name: "Ош" },
  { code: "B", name: "Баткенская область" },
  { code: "J", name: "Джалал-Абадская область" },
  { code: "Y", name: "Иссык-Кульская область" },
  { code: "N", name: "Нарынская область" },
  { code: "O", name: "Ошская область" },
  { code: "T", name: "Таласская область" },
  { code: "C", name: "Чуйская область" },
];

const UZ_REGIONS: Region[] = [
  { code: "TK", name: "Ташкент" },
  { code: "QR", name: "Республика Каракалпакстан" },
  { code: "AN", name: "Андижанская область" },
  { code: "BU", name: "Бухарская область" },
  { code: "JI", name: "Джизакская область" },
  { code: "QA", name: "Кашкадарьинская область" },
  { code: "NW", name: "Навоийская область" },
  { code: "NG", name: "Наманганская область" },
  { code: "SA", name: "Самаркандская область" },
  { code: "SU", name: "Сурхандарьинская область" },
  { code: "SI", name: "Сырдарьинская область" },
  { code: "TO", name: "Ташкентская область" },
  { code: "FA", name: "Ферганская область" },
  { code: "XO", name: "Хорезмская область" },
];

const AM_REGIONS: Region[] = [
  { code: "ER", name: "Ереван" },
  { code: "AG", name: "Арагацотнская область" },
  { code: "AR", name: "Араратская область" },
  { code: "AV", name: "Армавирская область" },
  { code: "VD", name: "Вайоцдзорская область" },
  { code: "GR", name: "Гехаркуникская область" },
  { code: "KT", name: "Котайкская область" },
  { code: "LO", name: "Лорийская область" },
  { code: "SU", name: "Сюникская область" },
  { code: "TV", name: "Тавушская область" },
  { code: "SH", name: "Ширакская область" },
];

/** Для этих стран регион выбирается из списка; для остальных — вводится. */
export const REGIONS_BY_COUNTRY: Record<string, Region[]> = {
  RU: RU_REGIONS,
  BY: BY_REGIONS,
  KZ: KZ_REGIONS,
  KG: KG_REGIONS,
  UZ: UZ_REGIONS,
  AM: AM_REGIONS,
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/** Страна по названию (с учётом синонимов) или по ISO-коду. */
export function findCountry(value: string | null | undefined): Country | null {
  if (!value?.trim()) return null;
  const v = norm(value);
  return (
    COUNTRIES.find(
      (c) => c.code.toLowerCase() === v || norm(c.name) === v || c.aliases?.some((a) => norm(a) === v),
    ) ?? null
  );
}

/** Пустая страна — Россия: так её видят сайт и отчёты. */
export function countryOrDefault(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : DEFAULT_COUNTRY;
}

export function regionsFor(country: string | null | undefined): Region[] | null {
  const c = findCountry(countryOrDefault(country));
  return c ? (REGIONS_BY_COUNTRY[c.code] ?? null) : null;
}

// \b в JS не видит кириллицу словом — границы задаём через \p{L}.
const REGION_NOISE =
  /(?<!\p{L})(республика|респ|область|обл|край|автономный округ|автономная область|ао|город|г|народная|федерального значения)(?!\p{L})\.?/gu;

function regionKey(s: string): string {
  return norm(s)
    .replace(/[—–-]/g, " ")
    .replace(/[().,]/g, " ")
    .replace(REGION_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Регион из справочника страны по коду ISO 3166-2 или по названию
 * («Брестская Область», «Свердловская обл.», «Татарстан»). null — не нашли.
 */
export function matchRegion(
  country: string | null | undefined,
  input: { code?: string | null; name?: string | null },
): Region | null {
  const list = regionsFor(country);
  if (!list) return null;
  const code = input.code?.trim().toUpperCase();
  if (code) {
    const byCode = list.find((r) => r.code === code);
    if (byCode) return byCode;
  }
  const name = input.name?.trim();
  if (!name) return null;
  const key = regionKey(name);
  if (!key) return null;
  return (
    list.find((r) => regionKey(r.name) === key) ??
    list.find((r) => {
      const rk = regionKey(r.name);
      return key.length >= 5 && rk.length >= 5 && (rk.startsWith(key) || key.startsWith(rk));
    }) ??
    null
  );
}

/** Сравнение местоположений: пустая страна равна России, регистр и пробелы не важны. */
export function sameLocationValue(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a ?? "") === norm(b ?? "");
}
