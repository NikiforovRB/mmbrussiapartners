/**
 * Выгрузка представителей и истории выдач из ЛК DriveMods (store.drivemods.ru).
 * Только чтение: скрипт входит под учёткой ЛК, читает списки через тот же
 * processQuery, что и веб-кабинет, и выходит из сессии.
 *
 *   $env:DRIVEMODS_LK_USERNAME="…"; $env:DRIVEMODS_LK_PASSWORD="…"
 *   npx tsx scripts/drivemods-lk-export.ts [папка-для-выгрузки]
 *
 * Учётные данные берутся только из окружения и никуда не записываются.
 * Результат — JSON (пользователи и записи без файлов лицензий); его разбирает
 * scripts/drivemods-lk-import.ts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

const BASE = process.env.DRIVEMODS_LK_URL ?? "https://store.drivemods.ru";
const APP_ID = "dmStoreApp";
const PAGE = 500;

type Json = Record<string, unknown>;

const installationId = randomUUID();

async function call(path: string, body: Json, sessionToken?: string): Promise<Json> {
  const res = await fetch(`${BASE}/parse/${path}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      ...body,
      _ApplicationId: APP_ID,
      _ClientVersion: "js4.1.0",
      _InstallationId: installationId,
      ...(sessionToken ? { _SessionToken: sessionToken } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Json;
}

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "iso" in value) return String((value as Json).iso);
  return typeof value === "string" ? value : null;
}

function pointerId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Json;
  return (v.objectId as string) ?? (v.id as string) ?? null;
}

function slimUser(u: Json) {
  return {
    id: String(u.id ?? u.objectId),
    name: typeof u.name === "string" ? u.name.trim() : "",
    email: (u.email as string) ?? (u.username as string) ?? null,
    phone: (u.phone as string) ?? null,
    city: typeof u.city === "string" ? u.city.trim() : null,
    country: (u.country as string) ?? null,
    isActive: u.isActive !== false,
    createdAt: iso(u.createdAt),
    priceGroup: pointerId(u.priceGroup),
    parentUser: pointerId(u.parentUser),
    limitNum: typeof u.limitNum === "number" ? u.limitNum : null,
    limitTotal: typeof u.limitTotal === "number" ? u.limitTotal : null,
  };
}

function slimRecord(r: Json) {
  const by = (r.createdBy ?? {}) as Json;
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v));
  return {
    id: String(r.id ?? r.objectId),
    createdAt: iso(r.createdAt),
    type: num(r.type),
    licenseType: num(r.licenseType),
    product: (r.product as string) ?? null,
    bundle: (r.bundle as string) ?? null,
    region: (r.region as string) ?? null,
    version: (r.version as string) ?? null,
    versionCustom: (r.versionCustom as string) ?? null,
    currency: num(r.currency),
    priceBase: num(r.priceBase),
    priceTotal: num(r.priceTotal),
    discount: num(r.discount),
    discountType: num(r.discountType),
    discountName: (r.discountName as string) ?? null,
    couponCode: (r.couponCode as string) ?? null,
    paymentStatus: num(r.paymentStatus),
    paidWith: r.paidWith ?? null,
    dealerComment: typeof r.dealerComment === "string" ? r.dealerComment : null,
    recoverable: r.recoverable === true,
    isActive: r.isActive !== false,
    createdById: pointerId(by),
    createdByName: typeof by.name === "string" ? by.name.trim() : null,
    createdByEmail: (by.email as string) ?? null,
    payItems: Array.isArray(r.payItems) ? r.payItems.length : null,
  };
}

async function listAll(resource: string, sessionToken: string, sort = "createdAt") {
  const out: Json[] = [];
  for (let page = 1; ; page += 1) {
    const res = await call(
      "functions/processQuery",
      {
        type: "GET_LIST",
        resource,
        params: { pagination: { page, perPage: PAGE }, sort: { field: sort, order: "ASC" }, filter: {} },
        appVersion: "1.3.1",
      },
      sessionToken,
    );
    const result = (res.result ?? {}) as { total?: number; data?: Json[] };
    const data = result.data ?? [];
    out.push(...data);
    process.stdout.write(`\r${resource}: ${out.length}/${result.total ?? "?"}   `);
    if (data.length < PAGE) break;
  }
  process.stdout.write("\n");
  return out;
}

async function main() {
  const username = process.env.DRIVEMODS_LK_USERNAME;
  const password = process.env.DRIVEMODS_LK_PASSWORD;
  if (!username || !password) {
    throw new Error("Задайте DRIVEMODS_LK_USERNAME и DRIVEMODS_LK_PASSWORD в окружении");
  }
  const outDir = resolve(process.argv[2] ?? join(process.cwd(), "..", "mmbrussia-exports"));

  const login = await call("login", { username, password, _method: "GET" });
  const sessionToken = login.sessionToken as string | undefined;
  if (!sessionToken) throw new Error("ЛК DriveMods не выдал сессию");

  try {
    const users = (await listAll("users", sessionToken, "name")).map(slimUser);
    const records = (await listAll("Record", sessionToken)).map(slimRecord);
    const owner = slimUser(login);

    await mkdir(outDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = join(outDir, `drivemods-lk-${stamp}.json`);
    await writeFile(
      file,
      JSON.stringify({ fetchedAt: new Date().toISOString(), source: BASE, owner, users, records }),
    );
    console.log(`Пользователей: ${users.length}, записей: ${records.length}`);
    console.log(`Сохранено: ${file}`);
  } finally {
    await call("logout", {}, sessionToken).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
