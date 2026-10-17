import "server-only";

import { after } from "next/server";
import { Prisma, type SitePublicationStatus, type UserStatus } from "@prisma/client";
import { db } from "./db";
import { notifyUser } from "./app-notifications";
import { hasAdminScope } from "./permissions";
import { fioFromParts } from "./utils";
import { readSiteEntries, sameSiteComment, type SiteEntry } from "./site-sync-labels";

/**
 * Синхронизация «Дилерской сети» на mmbrussia.ru: одобренные телефоны
 * дилеров уходят на сайт, снятые — удаляются оттуда.
 *
 * Обратная сторона: каждые 30 минут кабинет читает список сайта. Номер дилера,
 * который уже стоит на сайте в записи из админки сайта, кабинет считает
 * опубликованным (так советует протокол сайта) и забирает оттуда города и
 * подпись — сверка связывает такие записи с дилером, не создавая дублей.
 * Дальше связанные записи ведёт кабинет.
 *
 * Секрет MMB_DEALERS_SYNC_SECRET даёт право записи в список на сайте, поэтому
 * модуль работает только на сервере, а переменные — без префикса NEXT_PUBLIC_.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
const MAX_DEALERS_PER_REQUEST = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULER_TICK_MS = 30 * 60 * 1000;
const LOG_RETENTION_MS = 90 * DAY_MS;
const DEFAULT_COUNTRY = "Россия";
/** Короче — не телефон, а обрывок: по нему записи не сопоставляем. */
const PHONE_KEY_MIN = 10;
const NOT_CONFIGURED = "Интеграция не настроена: нет MMB_SITE_URL или MMB_DEALERS_SYNC_SECRET";

/** Пометка в карточке дилера: публикацию включил кабинет, потому что номер уже был на сайте. */
export const SITE_TAKEOVER_NOTE = "Номер уже был на сайте — публикация включена по данным сайта";

export type SiteAction = "upsert" | "remove" | "sync";
export type SiteResultStatus =
  | "created"
  | "linked"
  | "updated"
  | "unchanged"
  | "removed"
  | "conflict"
  | "error";

/** После этих статусов запись дилера есть на сайте. */
const LISTED_STATUSES = new Set<string>(["created", "linked", "updated", "unchanged"]);

/** У дилера из нескольких городов строк ответа несколько: в карточку идёт самая важная. */
const RESULT_PRIORITY: SiteResultStatus[] = ["error", "conflict", "created", "linked", "updated", "unchanged", "removed"];

export type SiteCity = { city: string; country?: string };

export type SiteDealer = {
  externalId: string;
  phone: string;
  cities: SiteCity[];
  comment: string | null;
};

export type SiteResult = {
  externalId: string;
  status: SiteResultStatus;
  city?: string | null;
  phone?: string | null;
  branchId?: string | null;
  message?: string | null;
};

export type SiteSummary = Partial<Record<SiteResultStatus | "adopted", number>>;

export type SiteOutcome = {
  ok: boolean;
  httpStatus: number | null;
  summary: SiteSummary | null;
  results: SiteResult[];
  warnings: string[];
  error: string | null;
  /** Сайт не ответил или ответил 5xx — запрос стоит повторить. */
  retryable: boolean;
};

export type FullSyncResult = SiteOutcome & { dealers: number };

/** Условие «телефон должен быть на сайте» для выборок из DealerProfile. */
export const PUBLISHED_ON_SITE_WHERE = {
  phoneVisibleOnSite: true,
  sitePublication: "APPROVED",
  user: { status: "APPROVED" },
} satisfies Prisma.DealerProfileWhereInput;

export function isPublishedOnSite(
  status: UserStatus,
  p: { phoneVisibleOnSite: boolean; sitePublication: SitePublicationStatus },
): boolean {
  return status === "APPROVED" && p.phoneVisibleOnSite && p.sitePublication === "APPROVED";
}

/** Телефон для сравнения так же, как его сравнивает сайт: только цифры, 8… и 10 цифр → 7…. */
export function phoneKey(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
}

/** Город для сравнения так же, как на сайте: регистр, ё/е, «г.» и пробелы у дефиса не важны. */
export function cityKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^\s*г\.?\s+/, "")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueCities(list: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const city = raw?.trim().slice(0, 100);
    const key = cityKey(city);
    if (!city || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

/** Города дилера в «Дилерской сети»: заданные для сайта, иначе город профиля. */
export function siteCitiesOf(p: { city: string | null; siteCities: readonly string[] }): string[] {
  return uniqueCities(p.siteCities.length > 0 ? p.siteCities : [p.city]);
}

/** Список городов для сохранения: совпадает с городом профиля — храним пустым. */
export function normalizeSiteCities(cities: readonly string[], profileCity: string | null): string[] {
  const list = uniqueCities(cities);
  return list.length === 1 && cityKey(list[0]) === cityKey(profileCity) ? [] : list;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Что уходит на сайт. Адрес и email не отправляем: дилер давал
 * согласие на публикацию только телефона.
 */
export function toSiteDealer(
  userId: string,
  p: {
    phone: string;
    city: string | null;
    country: string | null;
    siteComment: string | null;
    siteCities: readonly string[];
  },
): SiteDealer | null {
  const phone = p.phone?.trim();
  const cities = siteCitiesOf(p);
  if (!phone || cities.length === 0) return null;
  const home = cityKey(p.city);
  const country = p.country?.trim() || DEFAULT_COUNTRY;
  return {
    externalId: userId,
    phone,
    // Страна известна только для города профиля; для остальных сайт берёт страну этого города у себя.
    cities: cities.map((city) => (cityKey(city) === home ? { city, country } : { city })),
    comment: p.siteComment?.trim().slice(0, 200) || null,
  };
}

function siteConfig() {
  const base = process.env.MMB_SITE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.MMB_DEALERS_SYNC_SECRET?.trim();
  if (!base || !secret) return null;
  return { endpoint: `${base}/api/integrations/dealers`, secret };
}

export function isSiteSyncConfigured(): boolean {
  return siteConfig() !== null;
}

function failure(httpStatus: number | null, error: string, retryable: boolean): SiteOutcome {
  return { ok: false, httpStatus, summary: null, results: [], warnings: [], error, retryable };
}

function describeHttpError(status: number, detail: string | null): string {
  if (status === 401) return "Сайт не принял ключ: проверьте MMB_DEALERS_SYNC_SECRET";
  if (status === 503) return "На сайте выключена интеграция (не задан DEALERS_SYNC_SECRET)";
  if (status === 400) return `Сайт отклонил запрос${detail ? `: ${detail}` : ""}`;
  return `Ошибка сайта, HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

function describeNetworkError(err: unknown): string {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return `Сайт не ответил за ${REQUEST_TIMEOUT_MS / 1000} секунд`;
  }
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : null;
  return `Сайт недоступен: ${cause ?? (err instanceof Error ? err.message : String(err))}`;
}

async function requestSite(method: "GET" | "POST", body?: unknown) {
  const cfg = siteConfig();
  if (!cfg) throw new Error(NOT_CONFIGURED);
  const res = await fetch(cfg.endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.secret}`,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, ok: res.ok, data };
}

function errorDetail(data: Record<string, unknown> | null): string | null {
  const value = data?.error ?? data?.message;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function pushToSite(body: Record<string, unknown>): Promise<SiteOutcome> {
  if (!isSiteSyncConfigured()) return failure(null, NOT_CONFIGURED, false);
  let res: Awaited<ReturnType<typeof requestSite>>;
  try {
    res = await requestSite("POST", body);
  } catch (err) {
    return failure(null, describeNetworkError(err), true);
  }
  const data = res.data;
  const results = Array.isArray(data?.results) ? (data.results as SiteResult[]) : [];
  const warnings = Array.isArray(data?.warnings) ? (data.warnings as unknown[]).map(String) : [];
  const summary = data?.summary && typeof data.summary === "object" ? (data.summary as SiteSummary) : null;
  if (!res.ok || data?.ok !== true) {
    return {
      ok: false,
      httpStatus: res.status,
      summary,
      results,
      warnings,
      error: describeHttpError(res.status, errorDetail(data)),
      retryable: res.status >= 500,
    };
  }
  return { ok: true, httpStatus: res.status, summary: summary ?? {}, results, warnings, error: null, retryable: false };
}

export type SiteDirectoryEntry = {
  id: string;
  city: string;
  country: string | null;
  phone: string;
  phoneDigits: string;
  comment: string | null;
  externalId: string | null;
  source: "manual" | "cabinet";
  syncedAt: string | null;
};

/** Текущий список «Дилерской сети» на сайте. */
export async function fetchSiteDealers(): Promise<
  { ok: true; dealers: SiteDirectoryEntry[] } | { ok: false; error: string }
> {
  if (!isSiteSyncConfigured()) return { ok: false, error: NOT_CONFIGURED };
  try {
    const res = await requestSite("GET");
    if (!res.ok || !Array.isArray(res.data?.dealers)) {
      return { ok: false, error: describeHttpError(res.status, errorDetail(res.data)) };
    }
    return { ok: true, dealers: res.data.dealers as SiteDirectoryEntry[] };
  } catch (err) {
    return { ok: false, error: describeNetworkError(err) };
  }
}

async function logExchange(input: {
  action: SiteAction;
  trigger: string;
  dryRun?: boolean;
  dealers: number;
  outcome: SiteOutcome;
  actorId?: string | null;
}): Promise<void> {
  const { outcome } = input;
  if (!outcome.ok) {
    console.error(`[site-sync] ${input.action} (${input.trigger}): ${outcome.error}`);
  }
  const problems = outcome.results
    .filter((r) => r.status === "conflict" || r.status === "error")
    .slice(0, 100);
  try {
    await db.siteSyncLog.create({
      data: {
        action: input.action,
        trigger: input.trigger,
        dryRun: input.dryRun ?? false,
        ok: outcome.ok,
        httpStatus: outcome.httpStatus,
        dealers: input.dealers,
        ...(outcome.summary && { summary: outcome.summary as Prisma.InputJsonObject }),
        ...(outcome.warnings.length > 0 && { warnings: outcome.warnings }),
        ...(problems.length > 0 && { problems: problems as unknown as Prisma.InputJsonArray }),
        error: outcome.error,
        actorId: input.actorId ?? null,
      },
    });
  } catch (err) {
    console.error("[site-sync] не удалось записать журнал обмена", err);
  }
}

// Все обращения к сайту идут по одному: иначе медленный upsert мог бы прийти
// на сайт позже remove того же дилера и вернуть его в список.
type SyncState = {
  queue?: Promise<unknown>;
  retries?: Map<string, NodeJS.Timeout>;
  scheduler?: NodeJS.Timeout;
  /**
   * Отличия, оставшиеся после последней сверки (сайт их не принял). Проверка
   * по расписанию не запускает из-за них сверку снова — только из-за новых.
   */
  residual?: Set<string>;
};
const state = globalThis as typeof globalThis & { __mmbSiteSync?: SyncState };
const syncState: SyncState = (state.__mmbSiteSync ??= {});
const retries: Map<string, NodeJS.Timeout> = (syncState.retries ??= new Map());

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = (syncState.queue ?? Promise.resolve()).then(job);
  syncState.queue = run.catch(() => undefined);
  return run;
}

function runInBackground(job: () => Promise<unknown>) {
  const task = () =>
    enqueue(job).catch((err) => console.error("[site-sync] фоновая отправка упала", err));
  try {
    // Отправка идёт после ответа клиенту: действие администратора не ждёт сайт.
    after(task);
  } catch {
    void task();
  }
}

function cancelRetry(userId: string) {
  const timer = retries.get(userId);
  if (timer) clearTimeout(timer);
  retries.delete(userId);
}

function scheduleRetry(userId: string, attempt: number) {
  const delay = RETRY_DELAYS_MS[attempt];
  if (delay === undefined) return;
  cancelRetry(userId);
  const timer = setTimeout(() => {
    retries.delete(userId);
    void enqueue(() => syncDealerNow(userId, "retry", attempt + 1)).catch((err) =>
      console.error("[site-sync] повторная отправка упала", err),
    );
  }, delay);
  timer.unref?.();
  retries.set(userId, timer);
}

const PROFILE_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  phone: true,
  city: true,
  country: true,
  siteComment: true,
  siteCities: true,
  siteEntries: true,
  phoneVisibleOnSite: true,
  sitePublication: true,
  sitePublicationAt: true,
  siteListed: true,
  siteSyncStatus: true,
  user: { select: { status: true, isSuperAdmin: true, role: { select: { permissions: true } } } },
} satisfies Prisma.DealerProfileSelect;

type SiteProfile = Prisma.DealerProfileGetPayload<{ select: typeof PROFILE_SELECT }>;

const dealerName = (p: SiteProfile) => fioFromParts(p) || p.phone;

const isPublishedProfile = (p: SiteProfile) => isPublishedOnSite(p.user.status, p);

// --- Записи сайта с телефоном дилера ---

/** Записи из админки сайта с телефоном дилера, ещё не связанные ни с кем в кабинете. */
function freeRecordsFor(p: { phone: string }, site: SiteDirectoryEntry[]): SiteDirectoryEntry[] {
  const key = phoneKey(p.phone);
  if (key.length < PHONE_KEY_MIN) return [];
  return site.filter((r) => !r.externalId && r.phoneDigits === key);
}

function entriesFor(p: { userId: string; phone: string }, site: SiteDirectoryEntry[]): SiteEntry[] {
  const key = phoneKey(p.phone);
  return site
    .filter(
      (r) => r.externalId === p.userId || (!r.externalId && key.length >= PHONE_KEY_MIN && r.phoneDigits === key),
    )
    .map((r) => ({
      id: r.id,
      city: r.city,
      phone: r.phone,
      comment: r.comment?.trim() || null,
      linked: r.externalId === p.userId,
    }));
}

const entriesKey = (list: SiteEntry[]) =>
  JSON.stringify(list.map((e) => [e.id, e.city, e.phone, e.comment, e.linked]));

/** Запоминает, что сейчас на сайте с телефоном каждого дилера, — это видят дилер и администратор. */
async function saveSiteEntries(
  profiles: { userId: string; phone: string; siteEntries: Prisma.JsonValue }[],
  site: SiteDirectoryEntry[],
): Promise<void> {
  const writes = profiles.flatMap((p) => {
    const next = entriesFor(p, site);
    if (entriesKey(next) === entriesKey(readSiteEntries(p.siteEntries))) return [];
    return [
      db.dealerProfile.updateMany({
        where: { userId: p.userId },
        data: { siteEntries: next.length > 0 ? (next as unknown as Prisma.InputJsonArray) : Prisma.DbNull },
      }),
    ];
  });
  if (writes.length === 0) return;
  await db.$transaction(writes).catch((err) => console.error("[site-sync] не удалось сохранить записи сайта", err));
}

// --- Номера, которые уже стоят на сайте ---

type Takeover = {
  phoneVisibleOnSite?: boolean;
  sitePublication?: SitePublicationStatus;
  sitePublicationAt?: Date;
  sitePublicationById?: null;
  sitePublicationNote?: string;
  siteCities?: string[];
  siteComment?: string;
};

/**
 * Города и подпись из записей сайта, нужные, чтобы сверка связала эти записи
 * с дилером, а не создала рядом дубли. Пока у дилера нет ни связанных записей,
 * ни заданных городов, города берутся с сайта как есть; иначе добавляются к прежним.
 * Подпись переносится, только если в кабинете её ещё нет.
 */
function takeoverFields(
  p: Pick<SiteProfile, "city" | "siteCities" | "siteComment" | "siteListed">,
  free: SiteDirectoryEntry[],
): Takeover {
  if (free.length === 0) return {};
  const keep = p.siteListed || p.siteCities.length > 0 ? siteCitiesOf(p) : [];
  const siteCities = normalizeSiteCities([...keep, ...free.map((r) => r.city)], p.city);
  const out: Takeover = {};
  if (!sameList(siteCities, p.siteCities)) out.siteCities = siteCities;
  if (!p.siteListed && !p.siteComment?.trim()) {
    const home = cityKey(p.city);
    const withComment = free.filter((r) => r.comment?.trim());
    const comment = (withComment.find((r) => cityKey(r.city) === home) ?? withComment[0])?.comment?.trim();
    if (comment) out.siteComment = comment.slice(0, 200);
  }
  return out;
}

type TakeoverPlan = {
  takeovers: Map<string, Takeover>;
  /** Заявки на рассмотрении, одобренные по данным сайта: дилеру уходит уведомление. */
  approvedRequests: string[];
  notes: string[];
};

function planTakeovers(profiles: SiteProfile[], site: SiteDirectoryEntry[], now: Date): TakeoverPlan {
  const owners = new Map<string, number>();
  for (const p of profiles) {
    const key = phoneKey(p.phone);
    if (key.length >= PHONE_KEY_MIN) owners.set(key, (owners.get(key) ?? 0) + 1);
  }
  const plan: TakeoverPlan = { takeovers: new Map(), approvedRequests: [], notes: [] };
  for (const p of profiles) {
    const free = freeRecordsFor(p, site);
    if (free.length === 0) continue;
    // Номера сотрудников на сайте — контакты компании, а не дилеров.
    if (p.user.isSuperAdmin || hasAdminScope(p.user.role.permissions)) continue;
    const who = `${dealerName(p)} (${free.map((r) => `${r.city}, ${r.phone}`).join("; ")})`;
    if ((owners.get(phoneKey(p.phone)) ?? 0) > 1) {
      plan.notes.push(`${who}: этот телефон указан у нескольких дилеров кабинета — запись сайта не связана`);
      continue;
    }
    const published = p.sitePublication === "APPROVED" && p.phoneVisibleOnSite;
    const neverAsked = p.sitePublication === "NONE" && !p.sitePublicationAt;
    const requested = p.sitePublication === "PENDING" && p.phoneVisibleOnSite;
    const accountOpen = p.user.status === "APPROVED" || p.user.status === "PENDING";
    const later = p.user.status === "APPROVED" ? "" : " Записи свяжутся, когда учётная запись будет одобрена.";

    if (published) {
      const fields = takeoverFields(p, free);
      if (Object.keys(fields).length > 0) {
        plan.takeovers.set(p.userId, fields);
        plan.notes.push(`${who}: на сайте нашлись записи с телефоном дилера — они связываются с кабинетом.${later}`);
      }
      continue;
    }
    if (accountOpen && (neverAsked || requested)) {
      plan.takeovers.set(p.userId, {
        ...takeoverFields(p, free),
        phoneVisibleOnSite: true,
        sitePublication: "APPROVED",
        sitePublicationAt: now,
        sitePublicationById: null,
        sitePublicationNote: SITE_TAKEOVER_NOTE,
      });
      if (requested) plan.approvedRequests.push(p.userId);
      plan.notes.push(`${who}: номер уже есть на сайте — в кабинете публикация включается.${later}`);
      continue;
    }
    const reason = !accountOpen
      ? "учётная запись отклонена или заблокирована"
      : p.sitePublication === "REJECTED"
        ? "публикация отклонена или снята администратором"
        : "дилер выключил показ телефона";
    plan.notes.push(
      `${who}: номер есть на сайте в записи из админки сайта, а в кабинете ${reason}. Кабинет такую запись не трогает — проверьте её в админке сайта`,
    );
  }
  return plan;
}

async function applyTakeovers(plan: TakeoverPlan): Promise<void> {
  if (plan.takeovers.size === 0) return;
  await db.$transaction(
    [...plan.takeovers].map(([userId, data]) => db.dealerProfile.updateMany({ where: { userId }, data })),
  );
  for (const userId of plan.approvedRequests) {
    await notifyUser(userId, {
      type: "SITE_PUBLICATION_REVIEWED",
      title: "Телефон опубликован на сайте",
      body: "Номер уже был в «Дилерской сети» на mmbrussia.ru/contacts — заявка одобрена.",
      link: "/dealer/profile",
    });
  }
}

/** Перед первой отправкой дилера: если его номер уже стоит на сайте, забираем оттуда города и подпись. */
async function takeoverBeforeFirstLink(p: SiteProfile): Promise<Takeover | null> {
  const site = await fetchSiteDealers();
  if (!site.ok) return null;
  const free = freeRecordsFor(p, site.dealers);
  if (free.length === 0) return null;
  const key = phoneKey(p.phone);
  const others = await db.dealerProfile.findMany({ where: { userId: { not: p.userId } }, select: { phone: true } });
  if (others.some((o) => phoneKey(o.phone) === key)) return null;
  const fields = takeoverFields(p, free);
  if (Object.keys(fields).length === 0) return null;
  await db.dealerProfile.updateMany({ where: { userId: p.userId }, data: fields });
  return fields;
}

// --- Расхождения кабинета и сайта ---

type Drift = { key: string; message: string };

/** Чем связанные записи сайта отличаются от того, что кабинет считает опубликованным. */
function findDrift(profiles: SiteProfile[], site: SiteDirectoryEntry[]): Drift[] {
  const drift: Drift[] = [];
  const published = new Map<string, { p: SiteProfile; dealer: SiteDealer }>();
  for (const p of profiles) {
    const dealer = isPublishedProfile(p) ? toSiteDealer(p.userId, p) : null;
    if (dealer) published.set(p.userId, { p, dealer });
  }
  const linked = site.filter((r) => r.externalId);
  for (const { p, dealer } of published.values()) {
    const key = phoneKey(dealer.phone);
    for (const { city } of dealer.cities) {
      const where = `${dealerName(p)}, ${city}`;
      const r = linked.find((x) => x.externalId === p.userId && cityKey(x.city) === cityKey(city));
      if (!r) {
        drift.push({ key: `missing:${p.userId}:${cityKey(city)}`, message: `${where}: записи нет на сайте` });
        continue;
      }
      if (r.phoneDigits !== key) {
        drift.push({
          key: `phone:${r.id}:${key}`,
          message: `${where}: на сайте телефон ${r.phone}, в кабинете ${dealer.phone}`,
        });
      }
      if (!sameSiteComment(r.comment, dealer.comment)) {
        drift.push({
          key: `comment:${r.id}:${dealer.comment ?? ""}`,
          message: `${where}: подпись на сайте «${r.comment?.trim() || "—"}», в кабинете «${dealer.comment || "—"}»`,
        });
      }
    }
  }
  for (const r of linked) {
    const own = published.get(r.externalId ?? "");
    if (own?.dealer.cities.some((c) => cityKey(c.city) === cityKey(r.city))) continue;
    drift.push({
      key: `extra:${r.id}`,
      message: `${r.city}, ${r.phone}: запись связана с кабинетом, но там этот номер в этом городе не опубликован`,
    });
  }
  return drift;
}

// --- Отправка одного дилера ---

/**
 * Приводит запись дилера на сайте к текущему состоянию в БД: состояние
 * читается в момент отправки, поэтому повтор и дубли события безопасны.
 */
async function syncDealerNow(userId: string, trigger: string, attempt: number): Promise<SiteOutcome | null> {
  let profile = await db.dealerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
  let dealer = profile && isPublishedProfile(profile) ? toSiteDealer(userId, profile) : null;

  if (profile && dealer && !profile.siteListed) {
    const taken = await takeoverBeforeFirstLink(profile);
    if (taken) {
      profile = { ...profile, ...taken };
      dealer = toSiteDealer(userId, profile);
    }
  }

  let action: "upsert" | "remove";
  let outcome: SiteOutcome;
  if (dealer) {
    action = "upsert";
    outcome = await pushToSite({ action, dealers: [dealer] });
  } else if (!profile || profile.siteListed || profile.siteSyncStatus === "failed") {
    // Профиля нет — дилера удалили. «failed» — прошлая отправка не
    // дошла, и неизвестно, успел ли сайт её применить.
    action = "remove";
    outcome = await pushToSite({ action, externalIds: [userId] });
  } else {
    return null;
  }

  await logExchange({ action, trigger, dealers: 1, outcome });
  if (profile) {
    await applyDealerOutcome(userId, action, outcome);
    if (outcome.ok) {
      const site = await fetchSiteDealers();
      if (site.ok) await saveSiteEntries([profile], site.dealers);
    }
  }
  if (!outcome.ok && outcome.retryable) scheduleRetry(userId, attempt);
  return outcome;
}

function dealerOutcome(results: SiteResult[], userId: string) {
  const own = results.filter((r) => r.externalId === userId);
  const main = RESULT_PRIORITY.map((s) => own.find((r) => r.status === s)).find((r) => r !== undefined);
  return { main, listed: own.some((r) => LISTED_STATUSES.has(r.status)) };
}

async function applyDealerOutcome(userId: string, action: "upsert" | "remove", outcome: SiteOutcome) {
  const now = new Date();
  let data: Prisma.DealerProfileUpdateManyMutationInput;
  if (!outcome.ok) {
    data = { siteSyncedAt: now, siteSyncStatus: "failed", siteSyncMessage: outcome.error };
  } else {
    const { main, listed } = dealerOutcome(outcome.results, userId);
    const status = main?.status ?? (action === "remove" ? "removed" : "unchanged");
    data = {
      siteSyncedAt: now,
      siteSyncStatus: status,
      siteSyncMessage: main?.message ?? null,
      // При conflict/error сайт ничего не менял — прежняя запись, если была, осталась.
      ...(action === "upsert" && (listed || !main) && { siteListed: true }),
      ...(action === "remove" && status !== "error" && { siteListed: false }),
    };
  }
  await db.dealerProfile
    .updateMany({ where: { userId }, data })
    .catch((err) => console.error("[site-sync] не удалось сохранить результат отправки", err));
}

/**
 * Ставит в очередь отправку дилера на сайт (upsert или remove — по
 * текущему состоянию). Вызывать после записи изменений в БД.
 */
export function queueDealerSiteSync(userId: string, trigger: string): void {
  if (!isSiteSyncConfigured()) return;
  cancelRetry(userId);
  runInBackground(() => syncDealerNow(userId, trigger, 0));
}

/** Отправляет дилера на сайт сразу и возвращает ответ сайта. */
export async function syncDealerToSiteNow(userId: string, trigger: string): Promise<SiteOutcome | null> {
  cancelRetry(userId);
  return enqueue(() => syncDealerNow(userId, trigger, 0));
}

// --- Полная сверка ---

/**
 * Полная сверка: номера дилеров, уже стоящие на сайте, переносятся в кабинет,
 * после чего на сайте остаются ровно одобренные телефоны кабинета.
 */
export async function runFullSiteSync(opts: {
  dryRun: boolean;
  trigger: string;
  actorId?: string | null;
}): Promise<FullSyncResult> {
  return enqueue(() => fullSyncNow(opts));
}

async function fullSyncNow({
  dryRun,
  trigger,
  actorId,
}: {
  dryRun: boolean;
  trigger: string;
  actorId?: string | null;
}): Promise<FullSyncResult> {
  const finish = async (outcome: SiteOutcome, dealers: number): Promise<FullSyncResult> => {
    await logExchange({ action: "sync", trigger, dryRun, dealers, outcome, actorId });
    return { ...outcome, dealers };
  };

  const before = await fetchSiteDealers();
  if (!before.ok) return finish(failure(null, before.error, true), 0);

  const loaded = await db.dealerProfile.findMany({ select: PROFILE_SELECT, orderBy: { createdAt: "asc" } });
  const plan = planTakeovers(loaded, before.dealers, new Date());
  if (!dryRun) await applyTakeovers(plan);
  const profiles = loaded.map((p) => {
    const taken = plan.takeovers.get(p.userId);
    return taken ? { ...p, ...taken } : p;
  });
  const dealers = profiles
    .filter(isPublishedProfile)
    .map((p) => toSiteDealer(p.userId, p))
    .filter((d): d is SiteDealer => d !== null);

  const withPlan = (outcome: SiteOutcome, residual: Drift[] = []): SiteOutcome => ({
    ...outcome,
    summary:
      outcome.summary && plan.takeovers.size > 0
        ? { ...outcome.summary, adopted: plan.takeovers.size }
        : outcome.summary,
    warnings: [
      ...plan.notes,
      ...outcome.warnings,
      ...residual.map((d) => `После сверки на сайте осталось отличие: ${d.message}`),
    ],
  });

  if (dealers.length > MAX_DEALERS_PER_REQUEST) {
    return finish(
      withPlan(failure(null, `Слишком много дилеров для одного запроса: ${dealers.length}`, false)),
      dealers.length,
    );
  }

  let allowEmpty = false;
  if (dealers.length === 0) {
    // Пустой sync сайт принимает только с allowEmpty — это защита от случайной
    // очистки. Шлём его, лишь когда на сайте действительно остались записи кабинета.
    if (!before.dealers.some((d) => d.externalId)) {
      return finish(
        withPlan({
          ok: true,
          httpStatus: null,
          summary: {},
          results: [],
          warnings: ["Одобренных публикаций нет, и записей кабинета на сайте тоже нет — отправлять нечего."],
          error: null,
          retryable: false,
        }),
        0,
      );
    }
    allowEmpty = true;
  }

  const outcome = await pushToSite({
    action: "sync",
    dryRun,
    dealers,
    ...(allowEmpty && { allowEmpty: true }),
  });
  if (!outcome.ok || dryRun) return finish(withPlan(outcome), dealers.length);

  await applySyncOutcome(dealers, outcome);
  let residual: Drift[] = [];
  const after = await fetchSiteDealers();
  if (after.ok) {
    await saveSiteEntries(profiles, after.dealers);
    residual = findDrift(profiles, after.dealers);
    syncState.residual = new Set(residual.map((d) => d.key));
  }
  return finish(withPlan(outcome, residual), dealers.length);
}

async function applySyncOutcome(dealers: SiteDealer[], outcome: SiteOutcome) {
  const now = new Date();
  const ids = dealers.map((d) => d.externalId);
  try {
    await db.$transaction([
      ...dealers.map((d) => {
        const { main, listed } = dealerOutcome(outcome.results, d.externalId);
        return db.dealerProfile.updateMany({
          where: { userId: d.externalId },
          data: {
            siteListed: listed || !main,
            siteSyncedAt: now,
            siteSyncStatus: main?.status ?? "unchanged",
            siteSyncMessage: main?.message ?? null,
          },
        });
      }),
      // Всех, кого нет в списке, сверка с сайта сняла.
      db.dealerProfile.updateMany({
        where: {
          userId: { notIn: ids },
          OR: [{ siteListed: true }, { siteSyncStatus: "failed" }],
        },
        data: { siteListed: false, siteSyncedAt: now, siteSyncStatus: "removed", siteSyncMessage: null },
      }),
    ]);
  } catch (err) {
    console.error("[site-sync] не удалось сохранить результаты сверки", err);
  }
}

/**
 * Проверка по расписанию: читает список сайта и, если он разошёлся с кабинетом
 * (на сайте добавили номер дилера, удалили или поправили связанную запись),
 * запускает полную сверку. Иначе только обновляет то, что видно в карточках.
 */
async function checkSiteNow(): Promise<void> {
  const site = await fetchSiteDealers();
  if (!site.ok) {
    console.error(`[site-sync] проверка списка сайта: ${site.error}`);
    return;
  }
  const profiles = await db.dealerProfile.findMany({ select: PROFILE_SELECT });
  const plan = planTakeovers(profiles, site.dealers, new Date());
  const known = syncState.residual;
  const drift = findDrift(profiles, site.dealers).filter((d) => !known?.has(d.key));
  if (plan.takeovers.size > 0 || drift.length > 0) {
    await fullSyncNow({ dryRun: false, trigger: "site" });
    return;
  }
  await saveSiteEntries(profiles, site.dealers);
}

// --- Журнал и панель в настройках ---

export type SiteSyncLogEntry = {
  id: string;
  action: string;
  trigger: string;
  dryRun: boolean;
  ok: boolean;
  httpStatus: number | null;
  dealers: number;
  summary: Record<string, number> | null;
  warnings: string[];
  problems: SiteResult[];
  error: string | null;
  createdAt: string;
};

function toLogEntry(row: {
  id: string;
  action: string;
  trigger: string;
  dryRun: boolean;
  ok: boolean;
  httpStatus: number | null;
  dealers: number;
  summary: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  problems: Prisma.JsonValue;
  error: string | null;
  createdAt: Date;
}): SiteSyncLogEntry {
  return {
    ...row,
    summary: (row.summary as Record<string, number> | null) ?? null,
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    problems: Array.isArray(row.problems) ? (row.problems as unknown as SiteResult[]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

/** Данные для панели «Дилерская сеть на сайте» в настройках. */
export async function getSiteSyncOverview() {
  const [lastSync, recent, published, pending, problems] = await Promise.all([
    db.siteSyncLog.findFirst({ where: { action: "sync", dryRun: false }, orderBy: { createdAt: "desc" } }),
    db.siteSyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.dealerProfile.count({ where: PUBLISHED_ON_SITE_WHERE }),
    db.dealerProfile.count({ where: { sitePublication: "PENDING", phoneVisibleOnSite: true } }),
    db.dealerProfile.findMany({
      where: { ...PUBLISHED_ON_SITE_WHERE, siteSyncStatus: { in: ["failed", "conflict", "error"] } },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        city: true,
        siteSyncStatus: true,
        siteSyncMessage: true,
      },
      take: 50,
    }),
  ]);
  return {
    configured: isSiteSyncConfigured(),
    siteUrl: process.env.MMB_SITE_URL?.trim() || null,
    published,
    pending,
    lastSync: lastSync ? toLogEntry(lastSync) : null,
    recent: recent.map(toLogEntry),
    problems,
  };
}

export type SiteSyncOverview = Awaited<ReturnType<typeof getSiteSyncOverview>>;

async function runScheduledCheck() {
  const last = await db.siteSyncLog.findFirst({
    where: { action: "sync", dryRun: false, ok: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last || Date.now() - last.createdAt.getTime() >= DAY_MS) {
    await runFullSiteSync({ dryRun: false, trigger: "daily" });
    await db.siteSyncLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LOG_RETENTION_MS) } } });
    return;
  }
  await enqueue(checkSiteNow);
}

/**
 * Проверка внутри процесса кабинета: раз в полчаса сверяем список сайта с
 * кабинетом, а раз в сутки — полная сверка, даже если отличий не видно.
 */
export function startSiteSyncScheduler(): void {
  if (!isSiteSyncConfigured() || syncState.scheduler) return;
  const tick = () => {
    void runScheduledCheck().catch((err) => console.error("[site-sync] проверка по расписанию упала", err));
  };
  setTimeout(tick, 2 * 60 * 1000).unref?.();
  syncState.scheduler = setInterval(tick, SCHEDULER_TICK_MS);
  syncState.scheduler.unref?.();
}
