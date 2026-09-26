/**
 * Удаляет ВСЕ таблицы и enum-типы в схеме public базы из DATABASE_URL.
 * Запуск только с явным подтверждением имени базы:
 *
 *   $env:RESET_DB_CONFIRM="<имя базы>"; npx tsx scripts/reset-db.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL не задан");
const url = new URL(raw);
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (process.env.RESET_DB_CONFIRM !== database) {
  console.error(`Отказ: чтобы удалить всё в «${database}» на ${url.hostname}, задайте RESET_DB_CONFIRM=${database}`);
  process.exit(1);
}

const ca = readFileSync(resolve(process.cwd(), "certs/timeweb-ca.crt"), "utf8");

(async () => {
  const c = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined },
    connectionTimeoutMillis: 8000,
  });
  await c.connect();
  console.log("Connected. Resetting objects in public...");

  const tables = await c.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  for (const { tablename } of tables.rows) {
    await c.query(`DROP TABLE IF EXISTS "public"."${tablename}" CASCADE`);
    console.log(`  dropped table ${tablename}`);
  }

  const enums = await c.query<{ typname: string }>(
    `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'`
  );
  for (const { typname } of enums.rows) {
    await c.query(`DROP TYPE IF EXISTS "public"."${typname}" CASCADE`);
    console.log(`  dropped enum ${typname}`);
  }

  console.log("Reset done.");
  await c.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
