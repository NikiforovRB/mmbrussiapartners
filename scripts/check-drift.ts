/**
 * Проверка drift: миграции пишутся руками, поэтому легко получить схему,
 * которая не совпадает с prisma/schema.prisma. Скрипт накатывает все миграции
 * на пустую БД и сравнивает результат со schema.prisma; при расхождении
 * печатает SQL, которого не хватает миграциям, и завершается с кодом 1.
 *
 * Без DRIFT_DATABASE_URL поднимает временный embedded Postgres. В CI адрес
 * указывает на пустую сервисную БД. Рабочую (общую) БД сюда передавать нельзя:
 * на неё будут накатаны миграции.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type EmbeddedPostgres from "embedded-postgres";

const EMBEDDED_PORT = 5439;
const PRISMA_CLI = join(process.cwd(), "node_modules", "prisma", "build", "index.js");

function prisma(args: string[], url: string): number {
  const res = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
  return res.status ?? 1;
}

async function main() {
  let url = process.env.DRIFT_DATABASE_URL;
  let pg: EmbeddedPostgres | null = null;
  let dir: string | null = null;

  if (!url) {
    dir = mkdtempSync(join(tmpdir(), "mmb-drift-"));
    const { default: Embedded } = await import("embedded-postgres");
    pg = new Embedded({
      databaseDir: dir,
      user: "drift",
      password: "drift",
      port: EMBEDDED_PORT,
      persistent: false,
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("drift");
    url = `postgresql://drift:drift@localhost:${EMBEDDED_PORT}/drift`;
  }

  try {
    if (prisma(["migrate", "deploy"], url) !== 0) {
      console.error("Миграции не накатываются на пустую БД.");
      process.exitCode = 1;
      return;
    }
    const status = prisma(
      ["migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--script", "--exit-code"],
      url,
    );
    if (status === 0) {
      console.log("Drift нет: миграции дают ровно схему из schema.prisma.");
    } else {
      console.error(
        status === 2
          ? "Drift: schema.prisma расходится с миграциями — SQL выше показывает, чего не хватает в миграциях."
          : "prisma migrate diff завершился с ошибкой.",
      );
      process.exitCode = 1;
    }
  } finally {
    await pg?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
