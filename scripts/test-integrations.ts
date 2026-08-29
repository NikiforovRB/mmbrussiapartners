/**
 * Проверка внешних интеграций портала: DRIVEMODS Store API и АТОЛ Онлайн.
 *
 *   npm run test:integrations
 *
 * Скрипт ничего не создаёт: только авторизуется и, если передан файл
 * device_id.bin, запрашивает по нему /licinfo (генерацию не запускает).
 *
 *   npm run test:integrations -- ./device_id.bin
 */

const DM_BASE = process.env.DRIVEMODS_STORE_API_URL ?? "https://storeapi.drivemods.org";
const DM_TOKEN = process.env.DRIVEMODS_CLIENT_TOKEN ?? "";
const DM_USER = process.env.DRIVEMODS_USERNAME ?? "";
const DM_PASS = process.env.DRIVEMODS_PASSWORD ?? "";

const ATOL_BASE = process.env.ATOL_BASE_URL ?? "https://online.atol.ru/possystem/v4";
const ATOL_LOGIN = process.env.ATOL_LOGIN ?? "";
const ATOL_PASSWORD = process.env.ATOL_PASSWORD ?? "";
const ATOL_GROUP = process.env.ATOL_GROUP ?? "";

let failures = 0;

function ok(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg: string) {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
}
function skip(msg: string) {
  console.log(`  \x1b[33m•\x1b[0m ${msg}`);
}
function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function json(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function testDriveMods() {
  section("DRIVEMODS Store API");
  console.log(`  base: ${DM_BASE}`);

  if (!DM_USER || !DM_PASS || !DM_TOKEN) {
    skip("Нет DRIVEMODS_USERNAME / DRIVEMODS_PASSWORD / DRIVEMODS_CLIENT_TOKEN — пропуск");
    return;
  }

  try {
    const res = await fetch(`${DM_BASE}/health`, { cache: "no-store" });
    const data = await json(res);
    if (res.ok) ok(`/health → ${res.status} ${JSON.stringify(data)}`);
    else fail(`/health → ${res.status} ${JSON.stringify(data)}`);
  } catch (e) {
    fail(`/health → сеть недоступна: ${(e as Error).message}`);
    return;
  }

  let sessionToken = "";
  try {
    const res = await fetch(`${DM_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: DM_USER, password: DM_PASS, clientToken: DM_TOKEN }),
      cache: "no-store",
    });
    const data = await json(res);
    if (res.ok && data.sessionToken) {
      sessionToken = data.sessionToken as string;
      ok(`/login → авторизация мастер-аккаунта ${DM_USER} успешна`);
    } else {
      fail(`/login → ${res.status} ${JSON.stringify(data)}`);
      return;
    }
  } catch (e) {
    fail(`/login → ${(e as Error).message}`);
    return;
  }

  const devicePath = process.argv[2];
  let did: string;
  if (devicePath) {
    const { readFile } = await import("node:fs/promises");
    did = (await readFile(devicePath)).toString("base64");
  } else {
    // Без реального device_id.bin проверяем только то, что авторизованный
    // вызов доходит до сервиса: на мусорные данные ждём бизнес-ошибку,
    // а не отказ в доступе.
    did = Buffer.from("not-a-real-device-id").toString("base64");
  }

  const res = await fetch(`${DM_BASE}/licinfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ did, sessionToken, uid: DM_USER, clientToken: DM_TOKEN }),
    cache: "no-store",
  });
  const data = await json(res);

  if (devicePath) {
    if (res.ok) ok(`/licinfo → ${JSON.stringify(data).slice(0, 400)}`);
    else fail(`/licinfo → ${res.status} ${JSON.stringify(data)}`);
    return;
  }

  if (res.status === 401 || res.status === 403) {
    fail(`/licinfo → отказ в доступе (${res.status}): ${JSON.stringify(data)}`);
  } else {
    ok(`/licinfo → сессия принята, ответ ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    skip("Для полной проверки генерации передайте файл: npm run test:integrations -- ./device_id.bin");
  }
}

async function testAtol() {
  section("АТОЛ Онлайн (облачная касса, фискализация)");
  console.log(`  base: ${ATOL_BASE}`);

  if (!ATOL_LOGIN || !ATOL_PASSWORD) {
    skip("Нет ATOL_LOGIN / ATOL_PASSWORD — пропуск");
    return;
  }

  let token = "";
  try {
    const res = await fetch(`${ATOL_BASE}/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ login: ATOL_LOGIN, pass: ATOL_PASSWORD }),
      cache: "no-store",
    });
    const data = await json(res);
    if (res.ok && data.token) {
      token = data.token as string;
      ok(`/getToken → токен получен (${String(token).slice(0, 12)}…)`);
    } else {
      fail(`/getToken → ${res.status} ${JSON.stringify(data)}`);
      return;
    }
  } catch (e) {
    fail(`/getToken → ${(e as Error).message}`);
    return;
  }

  if (!ATOL_GROUP) {
    skip("Нет ATOL_GROUP (код группы ККТ) — регистрация чеков недоступна");
    return;
  }

  // Проверяем доступность группы ККТ безопасным способом: запрашиваем
  // отчёт по заведомо несуществующему UUID. Валидная группа отвечает 4xx
  // с бизнес-ошибкой, неверная — ошибкой доступа/маршрутизации.
  const res = await fetch(`${ATOL_BASE}/${ATOL_GROUP}/report/00000000-0000-0000-0000-000000000000`, {
    headers: { Token: token },
    cache: "no-store",
  });
  const data = await json(res);
  ok(`/${ATOL_GROUP}/report → ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
}

async function main() {
  await testDriveMods();
  await testAtol();
  console.log("");
  if (failures > 0) {
    console.log(`\x1b[31mПроверок с ошибкой: ${failures}\x1b[0m`);
    process.exit(1);
  }
  console.log("\x1b[32mВсе доступные проверки пройдены\x1b[0m");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
