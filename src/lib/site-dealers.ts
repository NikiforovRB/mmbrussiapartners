import "server-only";

import { after } from "next/server";
import type { Prisma, SitePublicationStatus, UserStatus } from "@prisma/client";
import { db } from "./db";

/**
 * Синхронизация «Дилерской сети» на mmbrussia.ru: одобренные телефоны
 * представителей уходят на сайт, снятые — удаляются оттуда.
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

export type SiteAction = "upsert" | "remove" | "sync";
export type SiteResultStatus =
  | "created"
  | "linked"
  | "updated"
  | "unchanged"
  | "removed"
  | "conflict"
  | "error";

/** После этих статусов запись представителя есть на сайте. */
const LISTED_STATUSES = new Set<string>(["created", "linked", "updated", "unchanged"]);

export type SiteDealer = {
  externalId: string;
  phone: string;
  city: string;
  country: string;
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

export type SiteSummary = Partial<Record<SiteResultStatus, number>>;

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

/**
 * Что уходит на сайт. Адрес и email не отправляем: представитель давал
 * согласие на публикацию только телефона.
 */
export function toSiteDealer(
  userId: string,
  p: { phone: string; city: string | null; country: string | null; siteComment: string | null },
): SiteDealer | null {
  const phone = p.phone?.trim();
  const city = p.city?.trim();
  if (!phone || !city) return null;
  return {
    externalId: userId,
    phone,
    city,
    country: p.country?.trim() || DEFAULT_COUNTRY,
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
  if (!cfg) {
    throw new Error("Интеграция не настроена: нет MMB_SITE_URL или MMB_DEALERS_SYNC_SECRET");
  }
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
  if (!isSiteSyncConfigured()) {
    return failure(null, "Интеграция не настроена: нет MMB_SITE_URL или MMB_DEALERS_SYNC_SECRET", false);
  }
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
  if (!isSiteSyncConfigured()) {
    return { ok: false, error: "Интеграция не настроена: нет MMB_SITE_URL или MMB_DEALERS_SYNC_SECRET" };
  }
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
// на сайт позже remove того же представителя и вернуть его в список.
type SyncState = {
  queue?: Promise<unknown>;
  retries?: Map<string, NodeJS.Timeout>;
  scheduler?: NodeJS.Timeout;
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

/**
 * Приводит запись представителя на сайте к текущему состоянию в БД: состояние
 * читается в момент отправки, поэтому повтор и дубли события безопасны.
 */
async function syncDealerNow(userId: string, trigger: string, attempt: number): Promise<SiteOutcome | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      dealerProfile: {
        select: {
          phone: true,
          city: true,
          country: true,
          siteComment: true,
          phoneVisibleOnSite: true,
          sitePublication: true,
          siteListed: true,
          siteSyncStatus: true,
        },
      },
    },
  });
  const profile = user?.dealerProfile ?? null;
  const dealer =
    user && profile && isPublishedOnSite(user.status, profile) ? toSiteDealer(userId, profile) : null;

  let action: "upsert" | "remove";
  let outcome: SiteOutcome;
  if (dealer) {
    action = "upsert";
    outcome = await pushToSite({ action, dealers: [dealer] });
  } else if (!profile || profile.siteListed || profile.siteSyncStatus === "failed") {
    // Профиля нет — представителя удалили. «failed» — прошлая отправка не
    // дошла, и неизвестно, успел ли сайт её применить.
    action = "remove";
    outcome = await pushToSite({ action, externalIds: [userId] });
  } else {
    return null;
  }

  await logExchange({ action, trigger, dealers: 1, outcome });
  if (profile) await applyDealerOutcome(userId, action, outcome);
  if (!outcome.ok && outcome.retryable) scheduleRetry(userId, attempt);
  return outcome;
}

async function applyDealerOutcome(userId: string, action: "upsert" | "remove", outcome: SiteOutcome) {
  const now = new Date();
  let data: Prisma.DealerProfileUpdateManyMutationInput;
  if (!outcome.ok) {
    data = { siteSyncedAt: now, siteSyncStatus: "failed", siteSyncMessage: outcome.error };
  } else {
    const r = outcome.results.find((x) => x.externalId === userId);
    const status = r?.status ?? (action === "remove" ? "removed" : "unchanged");
    data = {
      siteSyncedAt: now,
      siteSyncStatus: status,
      siteSyncMessage: r?.message ?? null,
      // При conflict/error сайт ничего не менял — прежняя запись, если была, осталась.
      ...(LISTED_STATUSES.has(status) && { siteListed: true }),
      ...(action === "remove" && status !== "error" && { siteListed: false }),
    };
  }
  await db.dealerProfile
    .updateMany({ where: { userId }, data })
    .catch((err) => console.error("[site-sync] не удалось сохранить результат отправки", err));
}

/**
 * Ставит в очередь отправку представителя на сайт (upsert или remove — по
 * текущему состоянию). Вызывать после записи изменений в БД.
 */
export function queueDealerSiteSync(userId: string, trigger: string): void {
  if (!isSiteSyncConfigured()) return;
  cancelRetry(userId);
  runInBackground(() => syncDealerNow(userId, trigger, 0));
}

/** Отправляет представителя на сайт сразу и возвращает ответ сайта. */
export async function syncDealerToSiteNow(userId: string, trigger: string): Promise<SiteOutcome | null> {
  cancelRetry(userId);
  return enqueue(() => syncDealerNow(userId, trigger, 0));
}

/** Полная сверка: на сайте остаются ровно одобренные телефоны кабинета. */
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
  const profiles = await db.dealerProfile.findMany({
    where: PUBLISHED_ON_SITE_WHERE,
    select: { userId: true, phone: true, city: true, country: true, siteComment: true },
    orderBy: { createdAt: "asc" },
  });
  const dealers = profiles
    .map((p) => toSiteDealer(p.userId, p))
    .filter((d): d is SiteDealer => d !== null);

  const finish = async (outcome: SiteOutcome): Promise<FullSyncResult> => {
    await logExchange({ action: "sync", trigger, dryRun, dealers: dealers.length, outcome, actorId });
    return { ...outcome, dealers: dealers.length };
  };

  if (dealers.length > MAX_DEALERS_PER_REQUEST) {
    return finish(failure(null, `Слишком много представителей для одного запроса: ${dealers.length}`, false));
  }

  let allowEmpty = false;
  if (dealers.length === 0) {
    // Пустой sync сайт принимает только с allowEmpty — это защита от случайной
    // очистки. Шлём его, лишь когда на сайте действительно остались записи кабинета.
    const site = await fetchSiteDealers();
    if (!site.ok) return finish(failure(null, site.error, true));
    if (!site.dealers.some((d) => d.externalId)) {
      return finish({
        ok: true,
        httpStatus: null,
        summary: {},
        results: [],
        warnings: ["Одобренных публикаций нет, и записей кабинета на сайте тоже нет — отправлять нечего."],
        error: null,
        retryable: false,
      });
    }
    allowEmpty = true;
  }

  const outcome = await pushToSite({
    action: "sync",
    dryRun,
    dealers,
    ...(allowEmpty && { allowEmpty: true }),
  });
  if (outcome.ok && !dryRun) await applySyncOutcome(dealers, outcome);
  return finish(outcome);
}

async function applySyncOutcome(dealers: SiteDealer[], outcome: SiteOutcome) {
  const now = new Date();
  const byId = new Map(outcome.results.map((r) => [r.externalId, r]));
  const ids = dealers.map((d) => d.externalId);
  try {
    await db.$transaction([
      ...dealers.map((d) => {
        const r = byId.get(d.externalId);
        const status = r?.status ?? "unchanged";
        return db.dealerProfile.updateMany({
          where: { userId: d.externalId },
          data: {
            siteListed: LISTED_STATUSES.has(status),
            siteSyncedAt: now,
            siteSyncStatus: status,
            siteSyncMessage: r?.message ?? null,
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

async function runDailySyncIfDue() {
  const last = await db.siteSyncLog.findFirst({
    where: { action: "sync", dryRun: false, ok: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && Date.now() - last.createdAt.getTime() < DAY_MS) return;
  await runFullSiteSync({ dryRun: false, trigger: "daily" });
  await db.siteSyncLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LOG_RETENTION_MS) } } });
}

/**
 * Ежедневная сверка внутри процесса кабинета: раз в полчаса проверяем, была ли
 * успешная сверка за последние сутки. Неудачная повторится на следующей проверке.
 */
export function startSiteSyncScheduler(): void {
  if (!isSiteSyncConfigured() || syncState.scheduler) return;
  const tick = () => {
    void runDailySyncIfDue().catch((err) => console.error("[site-sync] ежедневная сверка упала", err));
  };
  setTimeout(tick, 2 * 60 * 1000).unref?.();
  syncState.scheduler = setInterval(tick, SCHEDULER_TICK_MS);
  syncState.scheduler.unref?.();
}
