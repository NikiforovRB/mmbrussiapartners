/**
 * Прогон повторной генерации на боевом DRIVEMODS.
 *
 *   npx tsx scripts/test-repeat.ts [номер лицензии]
 *
 * Берёт device_id.bin уже выданной лицензии из S3 и прогоняет его заново
 * через портал: /licinfo должен вернуть recoverable, а новая лицензия —
 * получить метку «Повторная генерация». Выдача идёт без оплаты и с пометкой
 * ТЕСТ в комментарии дилера.
 */

import { PrismaClient } from "@prisma/client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, S3_BUCKET } from "../src/lib/s3";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "nikiforovrb@yandex.ru";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "1vngbwxcn824";

const prisma = new PrismaClient();

class Session {
  private cookies = new Map<string, string>();

  private absorb(res: Response) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers ?? {}),
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
    this.absorb(res);
    return res;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await this.raw(path, init);
    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: res.status, body: body as T };
  }

  post<T>(path: string, payload: unknown) {
    return this.json<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  upload<T>(path: string, field: string, file: Blob, name: string) {
    const form = new FormData();
    form.append(field, file, name);
    return this.json<T>(path, { method: "POST", body: form });
  }
}

async function login(): Promise<Session> {
  const s = new Session();
  const csrf = await s.json<{ csrfToken?: string }>("/api/auth/csrf");
  if (!csrf.body.csrfToken) throw new Error("Портал не отдал csrfToken — он запущен?");
  await s.raw("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.body.csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: BASE,
    }).toString(),
  });
  const session = await s.json<{ user?: { email?: string } }>("/api/auth/session");
  if (!session.body.user?.email) throw new Error("Не удалось войти администратором");
  return s;
}

type LicItem = {
  index: number;
  product: string;
  bundle: string | null;
  region: string | null;
  fullName: string;
  price: number;
  priced: boolean;
};

type LicInfo = {
  recoverable: boolean;
  repeat: boolean;
  previous: { number: string; type: string; createdAt: string } | null;
  versionSoftware: string;
  versionCustom: string;
  deviceId: string;
  items: LicItem[];
};

async function main() {
  const number = process.argv[2];
  const source = await prisma.license.findFirst({
    where: { deletedAt: null, deviceIdKey: { not: null }, ...(number ? { number } : {}) },
    orderBy: { createdAt: "desc" },
    select: { number: true, deviceId: true, deviceIdKey: true, product: true },
  });
  if (!source?.deviceIdKey) throw new Error("Не нашлось лицензии с сохранённым device_id.bin");

  console.log(`Берём device_id.bin лицензии ${source.number} (${source.product ?? "—"})`);
  const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: source.deviceIdKey }));
  const deviceBytes = await object.Body!.transformToByteArray();
  const deviceBase64 = Buffer.from(deviceBytes).toString("base64");

  const s = await login();

  const info = await s.upload<LicInfo>(
    "/api/drivemods/licinfo",
    "device",
    new Blob([deviceBytes]),
    "device_id.bin",
  );
  if (info.status !== 200) {
    throw new Error(`licinfo вернул ${info.status}: ${JSON.stringify(info.body)}`);
  }
  console.log("\n/licinfo:");
  console.log(`  recoverable: ${info.body.recoverable}`);
  console.log(`  метка портала: ${info.body.repeat ? "Повторная генерация" : "Новая генерация"}`);
  console.log(
    `  прошлая выдача: ${
      info.body.previous
        ? `${info.body.previous.number} от ${new Date(info.body.previous.createdAt).toLocaleDateString("ru-RU")}`
        : "нет"
    }`,
  );
  for (const it of info.body.items) {
    console.log(
      `  ${it.fullName} — ${it.price.toLocaleString("ru-RU")} ₽ (${it.priced ? "справочник" : "запасная"})`,
    );
  }

  const item = info.body.items[0];
  if (!item) throw new Error("DRIVEMODS не вернул ни одной позиции");

  const created = await s.post<{ licenseId?: string; number?: string; error?: string }>(
    "/api/drivemods/createlic",
    {
      deviceBase64,
      deviceId: info.body.deviceId,
      type: "Генерация",
      product: item.product,
      bundle: item.bundle,
      region: item.region,
      versionSoftware: info.body.versionSoftware,
      versionCustom: info.body.versionCustom,
      dealerComment: "ТЕСТ MMB портал: повторная генерация",
      recoverable: info.body.recoverable,
      issuedWithoutPayment: true,
    },
  );
  if (created.status !== 200 || !created.body.licenseId) {
    throw new Error(`createlic вернул ${created.status}: ${JSON.stringify(created.body)}`);
  }

  const saved = await prisma.license.findUnique({
    where: { id: created.body.licenseId },
    select: { number: true, repeatGeneration: true, product: true, bundle: true, productRegion: true },
  });
  console.log("\n/createlic:");
  console.log(`  лицензия: ${saved?.number}`);
  console.log(
    `  позиция: ${[saved?.product, saved?.bundle, saved?.productRegion].filter(Boolean).join(" ")}`,
  );
  console.log(`  repeatGeneration в базе: ${saved?.repeatGeneration}`);
  console.log(`\n  Карточка: ${BASE}/admin/licenses/${created.body.licenseId}`);
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
