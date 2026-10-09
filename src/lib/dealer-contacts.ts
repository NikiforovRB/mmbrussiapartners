export const TELEGRAM_NICK_PLACEHOLDER = "@ivan_dealer";
export const COMPANY_URL_PLACEHOLDER = "https://ваша-компания.ru";
export const COMPANY_URL_MAX = 300;

export class ContactFieldError extends Error {}

/** «ivan_dealer», «@ivan_dealer» и «t.me/ivan_dealer» → «@ivan_dealer». */
export function normalizeTelegramNick(raw: string | null | undefined): string | null {
  const value = (raw ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (!value) return null;
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) {
    throw new ContactFieldError(
      `Ник в Telegram — 5–32 латинские буквы, цифры или «_», например ${TELEGRAM_NICK_PLACEHOLDER}`,
    );
  }
  return `@${value}`;
}

/** «mmbrussia.ru» → «https://mmbrussia.ru»; только http(s) и адрес с доменом. */
export function normalizeCompanyUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.length > COMPANY_URL_MAX) {
    throw new ContactFieldError(`Ссылка на компанию — не длиннее ${COMPANY_URL_MAX} символов`);
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ContactFieldError("Укажите ссылку на сайт или страницу компании, например https://mmbrussia.ru");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".")) {
    throw new ContactFieldError("Укажите ссылку на сайт или страницу компании, например https://mmbrussia.ru");
  }
  // Адрес как ввёл дилер: URL перевёл бы кириллический домен в punycode.
  return withScheme.replace(/\/+$/, "");
}
