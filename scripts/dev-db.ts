import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = resolve(process.cwd(), ".postgres-data");
const PORT = 5433;
const USER = "mmb";
const PASSWORD = "mmb";
const DATABASE = "lkpartners";

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: (msg: string) => process.stdout.write(msg),
    onError: (err: Error) => process.stderr.write(String(err) + "\n"),
  });

  const cmd = process.argv[2] ?? "start";

  if (cmd === "init") {
    console.log("Initializing embedded PostgreSQL...");
    await pg.initialise();
    await pg.start();
    try {
      await pg.createDatabase(DATABASE);
      console.log(`Database "${DATABASE}" created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/exists/i.test(msg)) throw err;
      console.log(`Database "${DATABASE}" already exists`);
    }
    await pg.stop();
    console.log("Init done.");
    return;
  }

  if (cmd === "start") {
    await pg.start();
    console.log(`Embedded PostgreSQL listening on localhost:${PORT}`);
    console.log(`URL: postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`);
    process.on("SIGINT", async () => {
      await pg.stop();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await pg.stop();
      process.exit(0);
    });
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
