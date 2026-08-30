/**
 * Локальная заглушка DRIVEMODS Store API.
 *
 * Настоящий генератор выдаёт лицензию только по валидному device_id.bin
 * конкретного ШГУ, поэтому свою часть конвейера (лимиты, S3, база, счета,
 * уведомления, откат при сбое) прогоняем на заглушке.
 *
 * Отдельным процессом:
 *   npx tsx scripts/mock-drivemods.ts 3210
 *
 * Затем поднять портал с DRIVEMODS_STORE_API_URL=http://127.0.0.1:3210
 */

import { createServer, type Server } from "node:http";

export type MockState = {
  /** Следующий вызов /createlic завершится ошибкой — для проверки отката. */
  failNextCreate: boolean;
  createCalls: number;
  /** Ответ /licinfo о том, есть ли у сервиса лицензия для этого ШГУ. */
  recoverable: boolean;
};

export const mockState: MockState = {
  failNextCreate: false,
  createCalls: 0,
  recoverable: true,
};

// Повторяет то, что боевой сервис отдаёт на реальные device_id.bin: у одного
// продукта две комплектации без региона, у другого — комплектация с регионом.
// Названия заведомо тестовые: прогон трогает боевой справочник цен, и
// совпадение с настоящей позицией ломало бы проверки прайса.
const PRODUCTS = [
  { product: "ТЕСТ-S5WM", bundle: "FULL", region: null },
  { product: "ТЕСТ-S5WM", bundle: "ECO", region: null },
  { product: "ТЕСТ-A9", bundle: "FULL", region: "RUS" },
  { product: "ТЕСТ-LITE", bundle: null, region: null },
];

/**
 * Настоящий сервис принимает did только в URL-безопасном алфавите: на обычном
 * base64 его генератор отвечает 502. Повторяем это требование, иначе подмена
 * кодировки прошла бы мимо прогона.
 */
function badDid(did: unknown): string | null {
  if (typeof did !== "string" || did.length === 0) return "Отсутствуют обязательные параметры запроса";
  if (/[+/=]/.test(did)) return "Неверный ответ генератора лицензий";
  return null;
}

function json(res: Parameters<Parameters<typeof createServer>[0]>[1], code: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readBody(req: Parameters<Parameters<typeof createServer>[0]>[0]) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function startMockDriveMods(port = 3210): Promise<Server> {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];

    if (path === "/health") return json(res, 200, { status: "ok" });

    const body = await readBody(req);

    if (path === "/login") {
      if (!body.username || !body.password || !body.clientToken) {
        return json(res, 401, { error: "Нет учётных данных" });
      }
      return json(res, 200, { sessionToken: "mock-session-token" });
    }

    if (!body.sessionToken) return json(res, 401, { error: "Нет сессии" });

    if (path === "/licinfo") {
      const bad = badDid(body.did);
      if (bad) return json(res, bad.startsWith("Отсутствуют") ? 400 : 502, { error: bad });
      return json(res, 200, {
        // Признак того, что лицензия для ШГУ у сервиса уже есть.
        recoverable: mockState.recoverable,
        version_software: "1.2.3-mock",
        version_custom: "custom-mock",
        device_id: "MOCK-DEVICE-0001",
        items: PRODUCTS,
      });
    }

    if (path === "/createlic") {
      mockState.createCalls += 1;
      if (mockState.failNextCreate) {
        mockState.failNextCreate = false;
        return json(res, 502, { error: "Заглушка: имитация отказа генератора" });
      }
      const bad = badDid(body.did);
      if (bad) return json(res, bad.startsWith("Отсутствуют") ? 400 : 502, { error: bad });
      // bundle и region по документации передаются, только если они не null,
      // поэтому обязательными их не считаем.
      if (!body.product || !body.dealer_comment || !body.device_id) {
        return json(res, 400, { error: "Отсутствуют обязательные параметры запроса" });
      }
      return json(res, 200, {
        lic_file: Buffer.from(`MOCK-LICENSE ${body.product} ${Date.now()}`).toString("base64"),
        lic_filename: "device-license.bin",
        device_id: (body.device_id as string) || "MOCK-DEVICE-0001",
      });
    }

    return json(res, 404, { error: "Неизвестный метод заглушки" });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (process.argv[1]?.endsWith("mock-drivemods.ts")) {
  const port = Number(process.argv[2] ?? 3210);
  void startMockDriveMods(port).then(() => {
    console.log(`Заглушка DRIVEMODS слушает http://127.0.0.1:${port}`);
  });
}
