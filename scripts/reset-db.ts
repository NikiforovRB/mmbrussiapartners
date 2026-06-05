import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ca = readFileSync(resolve(process.cwd(), "certs/timeweb-ca.crt"), "utf8");

(async () => {
  const c = new Client({
    host: "216.57.107.241",
    port: 5432,
    user: "gen_user",
    password: "38O0Mpkm89GH45699",
    database: "default_db",
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
