/**
 * Сквозной прогон портала по реальному HTTP: выдача лицензий всех типов,
 * лимиты, права, счета, фискализация, крон, колбэк кассы, уведомления, аудит.
 *
 *   npm run test:e2e
 *
 * Заглушку генератора прогон поднимает сам, но портал должен быть запущен
 * с указанием на неё и на тестовый контур кассы — иначе прогон выпишет
 * настоящий фискальный чек на боевой ККТ. В PowerShell:
 *
 *   $env:DRIVEMODS_STORE_API_URL="http://127.0.0.1:3210"
 *   $env:ATOL_BASE_URL="https://testonline.atol.ru/possystem/v4"
 *   $env:ATOL_LOGIN="v4-online-atol-ru"
 *   $env:ATOL_PASSWORD="iGFFuihss"
 *   $env:ATOL_GROUP="v4-online-atol-ru_4179"
 *   npm run dev
 *
 * Все созданные записи помечены префиксом ТЕСТ и удаляются в конце прогона:
 * лицензии и счета — из базы, файлы — из S3.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { deleteObject } from "../src/lib/s3";
import { startMockDriveMods } from "./mock-drivemods";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 3210);
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "nikiforovrb@yandex.ru";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "1vngbwxcn824";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const ATOL_WEBHOOK_SECRET = process.env.ATOL_WEBHOOK_SECRET ?? "";

const MARK = "ТЕСТ";
const TEST_DEALER_EMAIL = "e2e.dealer@test.mmbrussia.local";
const TEST_DEALER_PASSWORD = "e2e-test-12345";
const TEST_DEALER_LIMIT = 3;

const prisma = new PrismaClient();
const startedAt = new Date();

// ─────────────────────────── отчёт ───────────────────────────

type Result = { name: string; state: "pass" | "fail" | "skip"; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, state: "pass", detail });
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, state: "fail", detail });
  console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
}
function skip(name: string, detail?: string) {
  results.push({ name, state: "skip", detail });
  console.log(`  \x1b[33m•\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
}
function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}
function check(name: string, condition: boolean, detail?: string) {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

// ───────────────────────── HTTP-клиент ─────────────────────────

class Session {
  private cookies = new Map<string, string>();

  absorb(res: Response) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), Cookie: this.header() },
    });
    this.absorb(res);
    return res;
  }

  async json<T = Record<string, unknown>>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ status: number; body: T }> {
    const res = await this.raw(path, init);
    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body: body as T };
  }

  post(path: string, payload: unknown) {
    return this.json(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  patch(path: string, payload: unknown) {
    return this.json(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}

async function login(email: string, password: string): Promise<Session | null> {
  const s = new Session();
  const csrf = await s.json<{ csrfToken?: string }>("/api/auth/csrf");
  if (!csrf.body.csrfToken) return null;

  const form = new URLSearchParams({
    csrfToken: csrf.body.csrfToken,
    email,
    password,
    callbackUrl: BASE,
  });
  await s.raw("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const session = await s.json<{ user?: { email?: string } }>("/api/auth/session");
  return session.body.user?.email ? s : null;
}

// ───────────────────────── тестовые данные ─────────────────────────

const created = {
  licenseIds: new Set<string>(),
  paymentIds: new Set<string>(),
  s3Keys: new Set<string>(),
};

// Хвост из этих байтов даёт в обычном base64 символы «+», «/» и добивку «=» —
// ровно то, чего не принимает генератор DRIVEMODS. Так прогон замечает, если
// портал перестанет приводить did к URL-безопасному алфавиту.
const DEVICE_BASE64 = Buffer.concat([
  Buffer.from("MOCK-DEVICE-ID-FILE-FOR-E2E"),
  Buffer.from([0xff, 0xef, 0xbe, 0xfa]),
]).toString("base64");

function licensePayload(type: string, extra: Record<string, unknown> = {}) {
  return {
    deviceBase64: DEVICE_BASE64,
    deviceId: "MOCK-DEVICE-0001",
    type,
    product: "DriveMods FULL",
    bundle: "ECO",
    region: "RU",
    versionSoftware: "1.2.3-mock",
    versionCustom: "custom-mock",
    dealerComment: `${MARK}: автопрогон`,
    termMonths: 0,
    customerFio: `${MARK} Клиент Тестович`,
    customerOrganization: `${MARK} ООО «Проверка»`,
    customerEmail: "e2e@test.mmbrussia.local",
    customerPhone: "+7 900 000-00-00",
    customerRegion: "Москва",
    customerCity: "Москва",
    ...extra,
  };
}

async function trackLicense(id: string) {
  created.licenseIds.add(id);
  const lic = await prisma.license.findUnique({
    where: { id },
    select: { deviceIdKey: true, licenseKey: true, payment: { select: { id: true } } },
  });
  if (lic?.deviceIdKey) created.s3Keys.add(lic.deviceIdKey);
  if (lic?.licenseKey) created.s3Keys.add(lic.licenseKey);
  if (lic?.payment) created.paymentIds.add(lic.payment.id);
}

// ───────────────────────── подготовка ─────────────────────────

async function ensureTestDealer() {
  const role = await prisma.role.findUnique({ where: { name: "Представитель" } });
  if (!role) throw new Error("Нет роли «Представитель» — выполните npm run db:seed");

  const passwordHash = await bcrypt.hash(TEST_DEALER_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: TEST_DEALER_EMAIL },
    update: { passwordHash, status: "APPROVED", roleId: role.id, isSuperAdmin: false },
    create: {
      email: TEST_DEALER_EMAIL,
      passwordHash,
      status: "APPROVED",
      roleId: role.id,
    },
  });

  await prisma.dealerProfile.upsert({
    where: { userId: user.id },
    update: { licenseLimit: TEST_DEALER_LIMIT, licensesUsed: 0 },
    create: {
      userId: user.id,
      firstName: "Тест",
      lastName: "Автопрогон",
      phone: "+7 900 000-00-01",
      organization: `${MARK} автопрогон`,
      city: "Москва",
      region: "Москва",
      licenseLimit: TEST_DEALER_LIMIT,
      licensesUsed: 0,
    },
  });

  return user.id;
}

// ───────────────────────── сценарии ─────────────────────────

async function testAuthGate() {
  section("Доступ и формат ошибок");

  const anon = new Session();
  const r1 = await anon.post("/api/drivemods/createlic", licensePayload("Генерация"));
  check(
    "Аноним не создаёт лицензию",
    r1.status === 401 && (r1.body as { code?: string }).code === "UNAUTHENTICATED",
    `${r1.status} ${(r1.body as { code?: string }).code ?? "—"}`,
  );

  const r2 = await anon.post("/api/payments/create", {});
  check(
    "Аноним не создаёт счёт",
    r2.status === 401 && (r2.body as { code?: string }).code === "UNAUTHENTICATED",
    `${r2.status}`,
  );

  const r3 = await anon.json("/api/notifications");
  check("Аноним не читает уведомления", r3.status === 401, `${r3.status}`);
}

async function testGeneration(dealer: Session, dealerId: string) {
  section("Выдача лицензий: все типы");

  for (const [type, termMonths, termLabel] of [
    ["Генерация", 0, "бессрочная"],
    ["Обновление", 12, "1 год"],
    ["Восстановление", 36, "3 года"],
  ] as const) {
    const res = await dealer.post(
      "/api/drivemods/createlic",
      licensePayload(type, { termMonths }),
    );
    const body = res.body as { licenseId?: string; number?: string; payment?: { amount: number } | null; error?: string };
    if (res.status !== 200 || !body.licenseId) {
      fail(`Тип «${type}»`, `${res.status} ${body.error ?? ""}`);
      continue;
    }
    await trackLicense(body.licenseId);

    const lic = await prisma.license.findUnique({ where: { id: body.licenseId } });
    const termOk = termMonths === 0 ? lic?.termEnd === null : lic?.termEnd instanceof Date;
    const audit = await prisma.licenseAuditLog.count({
      where: { licenseId: body.licenseId, action: "CREATED" },
    });

    check(
      `Тип «${type}» (${termLabel})`,
      lic?.type === type && lic?.status === "ACTIVE" && termOk && audit === 1,
      `${body.number}, срок ${lic?.termEnd ? lic.termEnd.toISOString().slice(0, 10) : "бессрочно"}, счёт ${body.payment?.amount ?? "—"} ₽`,
    );
  }

  section("Лимит представителя");
  const profile = await prisma.dealerProfile.findUnique({ where: { userId: dealerId } });
  const realCount = await prisma.license.count({
    where: { dealerId, deletedAt: null, status: { in: ["DRAFT", "ACTIVE", "EXPIRED"] } },
  });
  check(
    "licensesUsed совпадает с числом активных лицензий",
    profile?.licensesUsed === realCount,
    `licensesUsed=${profile?.licensesUsed}, фактически=${realCount}, лимит=${profile?.licenseLimit}`,
  );

  const over = await dealer.post("/api/drivemods/createlic", licensePayload("Генерация"));
  const overBody = over.body as { licenseId?: string; error?: string };
  if (overBody.licenseId) await trackLicense(overBody.licenseId);
  check(
    "Лицензия сверх лимита отклонена",
    over.status === 403,
    `${over.status} ${overBody.error ?? "лицензия выдана вопреки лимиту"}`,
  );
}

async function testConcurrentLimit(dealer: Session, dealerId: string) {
  section("Лимит при параллельных запросах");

  await prisma.license.deleteMany({ where: { dealerId } });
  await prisma.dealerProfile.update({
    where: { userId: dealerId },
    data: { licenseLimit: 2, licensesUsed: 0 },
  });

  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      dealer.post("/api/drivemods/createlic", licensePayload("Генерация")),
    ),
  );
  const okIds = attempts
    .map((r) => (r.body as { licenseId?: string }).licenseId)
    .filter((v): v is string => Boolean(v));
  for (const id of okIds) await trackLicense(id);

  check(
    "5 одновременных запросов при лимите 2 дают ровно 2 лицензии",
    okIds.length === 2,
    `выдано ${okIds.length}`,
  );

  await prisma.dealerProfile.update({
    where: { userId: dealerId },
    data: { licenseLimit: TEST_DEALER_LIMIT },
  });
}

async function testRollback(dealer: Session, dealerId: string) {
  section("Откат при сбое генератора");

  const before = await prisma.dealerProfile.findUnique({ where: { userId: dealerId } });
  const { mockState } = await import("./mock-drivemods");
  mockState.failNextCreate = true;

  const res = await dealer.post("/api/drivemods/createlic", licensePayload("Генерация"));
  const after = await prisma.dealerProfile.findUnique({ where: { userId: dealerId } });

  check("Сбой генератора отдан как ошибка", res.status >= 400, `${res.status}`);
  check(
    "Слот лимита возвращён после сбоя",
    before?.licensesUsed === after?.licensesUsed,
    `было ${before?.licensesUsed}, стало ${after?.licensesUsed}`,
  );
}

async function testFreeIssue(dealer: Session, admin: Session) {
  section("Выдача без оплаты — отдельное право");

  const res = await dealer.post(
    "/api/drivemods/createlic",
    licensePayload("Генерация", { issuedWithoutPayment: true }),
  );
  const body = res.body as { licenseId?: string };
  if (body.licenseId) {
    await trackLicense(body.licenseId);
    const lic = await prisma.license.findUnique({ where: { id: body.licenseId } });
    check(
      "Представитель не может выдать без оплаты",
      lic?.issuedWithoutPayment === false,
      `issuedWithoutPayment=${lic?.issuedWithoutPayment}, цена=${lic?.price ?? "—"}`,
    );
  } else {
    skip("Представитель не может выдать без оплаты", "лицензия не создана (лимит)");
  }

  const adminRes = await admin.post(
    "/api/drivemods/createlic",
    licensePayload("Генерация", { issuedWithoutPayment: true }),
  );
  const adminBody = adminRes.body as { licenseId?: string; payment?: unknown };
  if (adminBody.licenseId) {
    await trackLicense(adminBody.licenseId);
    const lic = await prisma.license.findUnique({ where: { id: adminBody.licenseId } });
    check(
      "Администратор с правом выдаёт без оплаты",
      lic?.issuedWithoutPayment === true && lic?.price === null && !adminBody.payment,
      `issuedWithoutPayment=${lic?.issuedWithoutPayment}, счёт=${adminBody.payment ? "создан" : "не создан"}`,
    );
  } else {
    fail("Администратор с правом выдаёт без оплаты", `${adminRes.status}`);
  }
}

async function testValidation(dealer: Session) {
  section("Валидация входа");

  const cases: Array<[string, Record<string, unknown>, number]> = [
    ["Неизвестный тип лицензии", licensePayload("Взлом"), 400],
    ["Недопустимый срок (7 месяцев)", licensePayload("Генерация", { termMonths: 7 }), 400],
    ["Пустой device_id.bin", licensePayload("Генерация", { deviceBase64: "" }), 400],
  ];

  for (const [name, payload, expected] of cases) {
    const res = await dealer.post("/api/drivemods/createlic", payload);
    const body = res.body as { code?: string; licenseId?: string };
    if (body.licenseId) await trackLicense(body.licenseId);
    check(name, res.status === expected, `${res.status} ${body.code ?? ""}`);
  }
}

async function testLicenseEditRights(dealer: Session, admin: Session, dealerId: string) {
  section("Права на редактирование лицензии");

  const license = await prisma.license.findFirst({
    where: { dealerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!license) {
    skip("Дилер не меняет статус своей лицензии", "нет тестовой лицензии");
    return;
  }

  const r1 = await dealer.patch(`/api/licenses/${license.id}`, { status: "CANCELLED" });
  const fresh1 = await prisma.license.findUnique({ where: { id: license.id } });
  check(
    "Дилер не меняет статус своей лицензии",
    r1.status === 403 && fresh1?.status === license.status,
    `${r1.status}, статус остался ${fresh1?.status}`,
  );

  const r2 = await dealer.patch(`/api/licenses/${license.id}`, { termEnd: null });
  check("Дилер не меняет срок своей лицензии", r2.status === 403, `${r2.status}`);

  const r3 = await dealer.patch(`/api/licenses/${license.id}`, {
    customerFio: `${MARK} Изменённый клиент`,
    vehicleModel: `${MARK} Lada`,
  });
  const fresh3 = await prisma.license.findUnique({ where: { id: license.id } });
  check(
    "Дилер правит карточку клиента",
    r3.status === 200 && fresh3?.customerFio === `${MARK} Изменённый клиент`,
    `${r3.status}`,
  );

  const r4 = await admin.patch(`/api/licenses/${license.id}`, { termEnd: null, status: "ACTIVE" });
  check("Администратор меняет срок и статус", r4.status === 200, `${r4.status}`);
}

async function testPayments(dealer: Session, admin: Session, dealerId: string) {
  section("Счета и оплата");

  const priced = await prisma.license.findFirst({
    where: { dealerId, deletedAt: null, payment: null },
    orderBy: { createdAt: "desc" },
  });

  const r1 = await dealer.post("/api/payments/create", {
    amount: 1,
    description: `${MARK}: попытка занизить сумму`,
    ...(priced ? { licenseId: priced.id } : {}),
  });
  const b1 = r1.body as { paymentId?: string };
  if (b1.paymentId) created.paymentIds.add(b1.paymentId);
  const p1 = b1.paymentId
    ? await prisma.payment.findUnique({ where: { id: b1.paymentId } })
    : null;
  const expectedPrice = Number(process.env.PAYMENT_LICENSE_PRICE ?? 0);
  check(
    "Сумма счёта берётся с сервера, а не от клиента",
    p1 != null && Number(p1.amount) === expectedPrice,
    `запрошен 1 ₽, выставлено ${p1 ? Number(p1.amount) : "—"} ₽`,
  );

  const foreign = await prisma.license.findFirst({
    where: { dealerId: { not: dealerId }, deletedAt: null, payment: null },
  });
  if (foreign) {
    const r2 = await dealer.post("/api/payments/create", { licenseId: foreign.id });
    const b2 = r2.body as { paymentId?: string; code?: string };
    if (b2.paymentId) created.paymentIds.add(b2.paymentId);
    check(
      "Счёт по чужой лицензии отклонён",
      r2.status === 403 && b2.code === "FORBIDDEN",
      `${r2.status} ${b2.code ?? ""}`,
    );
  } else {
    skip("Счёт по чужой лицензии отклонён", "нет чужой лицензии без счёта");
  }

  const r3 = await dealer.post(`/api/payments/${b1.paymentId}`, { action: "confirm" });
  check(
    "Дилер не подтверждает оплату сам",
    r3.status === 403,
    `${r3.status}`,
  );

  if (!b1.paymentId) {
    skip("Подтверждение оплаты администратором", "нет счёта");
    return;
  }

  const r4 = await admin.post(`/api/payments/${b1.paymentId}`, { action: "confirm" });
  const paid = await prisma.payment.findUnique({ where: { id: b1.paymentId } });
  check(
    "Администратор подтверждает оплату",
    r4.status === 200 && paid?.status === "PAID",
    `статус ${paid?.status}, чек ${paid?.receiptStatus ?? "—"}${paid?.receiptError ? ` (${paid.receiptError})` : ""}`,
  );

  check(
    "Чек ушёл в кассу",
    paid?.receiptStatus === "wait" || paid?.receiptStatus === "done",
    `receiptStatus=${paid?.receiptStatus}, uuid=${paid?.receiptUuid ?? "—"}, external_id=${paid?.id}-${paid?.receiptAttempt}`,
  );

  const r5 = await admin.post(`/api/payments/${b1.paymentId}`, { action: "confirm" });
  const twice = await prisma.payment.findUnique({ where: { id: b1.paymentId } });
  check(
    "Повторное подтверждение не пробивает второй чек",
    r5.status === 200 && twice?.receiptAttempt === paid?.receiptAttempt,
    `попытка ${twice?.receiptAttempt}`,
  );

  const r6 = await admin.post(`/api/payments/${b1.paymentId}`, { action: "cancel" });
  check(
    "Оплаченный счёт нельзя отменить",
    r6.status === 400,
    `${r6.status} ${(r6.body as { error?: string }).error ?? ""}`,
  );
}

async function testCronAndWebhook() {
  section("Крон и колбэк кассы");

  const anon = new Session();

  const noAuth = await anon.json("/api/cron/expire-licenses");
  check(
    "Крон без ключа не пускает",
    noAuth.status === 401 || noAuth.status === 403 || noAuth.status === 503,
    `${noAuth.status} ${(noAuth.body as { code?: string }).code ?? ""}`,
  );

  const wrong = await anon.json("/api/cron/expire-licenses", {
    headers: { Authorization: "Bearer wrong-cron-key" },
  });
  check("Крон с чужим ключом не пускает", wrong.status === 403, `${wrong.status}`);

  if (CRON_SECRET) {
    const right = await anon.json("/api/cron/expire-licenses", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    check("Крон с верным ключом отрабатывает", right.status === 200, `${right.status}`);
  } else {
    skip("Крон с верным ключом отрабатывает", "нет CRON_SECRET в окружении прогона");
  }

  const hookNoToken = await anon.post("/api/atol/webhook", { uuid: "нет-такого" });
  check(
    "Колбэк кассы без токена отклонён",
    hookNoToken.status === 403 || hookNoToken.status === 503,
    `${hookNoToken.status}`,
  );

  if (ATOL_WEBHOOK_SECRET) {
    const hookOk = await anon.post(
      `/api/atol/webhook?token=${encodeURIComponent(ATOL_WEBHOOK_SECRET)}`,
      { uuid: "00000000-0000-0000-0000-000000000000", status: "done" },
    );
    check(
      "Колбэк с токеном принят",
      hookOk.status === 200,
      `${hookOk.status} matched=${(hookOk.body as { matched?: boolean }).matched}`,
    );
  } else {
    skip("Колбэк с токеном принят", "нет ATOL_WEBHOOK_SECRET");
  }
}

async function testNotificationsAndAudit(admin: Session, dealerId: string) {
  section("Уведомления и аудит");

  const list = await admin.json<{ items: Array<{ id: string; title: string }>; unread: number }>(
    "/api/notifications",
  );
  check(
    "Счётчик уведомлений отдаётся",
    list.status === 200 && Array.isArray(list.body.items),
    `непрочитанных ${list.body.unread}, в списке ${list.body.items?.length ?? 0}`,
  );

  const dealerNotifications = await prisma.appNotification.count({ where: { userId: dealerId } });
  check(
    "События дилера попали в уведомления",
    dealerNotifications > 0,
    `${dealerNotifications} шт.`,
  );

  if (list.body.items?.length) {
    const mark = await admin.post("/api/notifications", { ids: [list.body.items[0].id] });
    const after = await admin.json<{ unread: number }>("/api/notifications");
    check(
      "Отметка «прочитано» уменьшает счётчик",
      mark.status === 200 && after.body.unread <= list.body.unread,
      `было ${list.body.unread}, стало ${after.body.unread}`,
    );
  } else {
    skip("Отметка «прочитано» уменьшает счётчик", "список пуст");
  }

  const before = await prisma.adminAuditLog.count();
  const r = await admin.patch(`/api/dealers/${dealerId}`, { profile: { licenseLimit: 7 } });
  const after = await prisma.adminAuditLog.count();
  const last = await prisma.adminAuditLog.findFirst({ orderBy: { createdAt: "desc" } });
  check(
    "Изменение дилера пишется в аудит с диффом",
    r.status === 200 && after > before && last?.entity === "DEALER" && last?.diff != null,
    `${r.status}, записей ${before} → ${after}, дифф ${JSON.stringify(last?.diff ?? {}).slice(0, 140)}`,
  );

  const escalation = await admin.patch(`/api/dealers/${dealerId}`, { isSuperAdmin: true });
  const dealerNow = await prisma.user.findUnique({ where: { id: dealerId } });
  check(
    "Флаг суперадмина не выставляется через PATCH дилера",
    dealerNow?.isSuperAdmin === false && escalation.status === 400,
    `${escalation.status}, isSuperAdmin=${dealerNow?.isSuperAdmin}`,
  );

  const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const selfRole = adminUser
    ? await admin.patch(`/api/dealers/${adminUser.id}`, { status: "SUSPENDED" })
    : null;
  check(
    "Администратор не блокирует сам себя",
    selfRole?.status === 403,
    `${selfRole?.status ?? "—"}`,
  );
}

async function testDealerCannotTouchOthers(dealer: Session, dealerId: string) {
  section("Представитель и чужие данные");

  const other = await prisma.user.findFirst({
    where: { id: { not: dealerId }, dealerProfile: { isNot: null } },
    select: { id: true },
  });
  if (!other) {
    skip("Дилер не правит чужой профиль", "нет другого представителя");
    return;
  }

  const r1 = await dealer.patch(`/api/dealers/${other.id}`, {
    profile: { organization: "ТЕСТ захват" },
  });
  check("Дилер не правит чужой профиль", r1.status === 403, `${r1.status}`);

  const r2 = await dealer.patch(`/api/dealers/${other.id}`, { profile: { licenseLimit: 999 } });
  check("Дилер не поднимает чужой лимит", r2.status === 403, `${r2.status}`);

  const r3 = await dealer.patch(`/api/dealers/${dealerId}`, { profile: { licenseLimit: 999 } });
  const self = await prisma.dealerProfile.findUnique({ where: { userId: dealerId } });
  check(
    "Дилер не поднимает свой лимит",
    r3.status === 403 && self?.licenseLimit !== 999,
    `${r3.status}, лимит ${self?.licenseLimit}`,
  );

  const foreign = await prisma.license.findFirst({
    where: { dealerId: { not: dealerId }, deletedAt: null, status: "ACTIVE" },
    select: { id: true, customerFio: true, status: true },
  });
  if (!foreign) {
    skip("Дилер не трогает чужую лицензию", "нет чужой активной лицензии");
  } else {
    const r4 = await dealer.patch(`/api/licenses/${foreign.id}`, { customerFio: `${MARK} захват` });
    const afterPatch = await prisma.license.findUnique({ where: { id: foreign.id } });
    check(
      "Дилер не правит чужую лицензию",
      r4.status === 403 && afterPatch?.customerFio === foreign.customerFio,
      `${r4.status}`,
    );

    const r5 = await dealer.json(`/api/licenses/${foreign.id}/download`);
    check("Дилер не скачивает чужой файл лицензии", r5.status === 403, `${r5.status}`);

    const r6 = await dealer.post(`/api/licenses/${foreign.id}/cancel`, {
      reason: `${MARK}: попытка аннулировать чужую лицензию`,
    });
    const afterCancel = await prisma.license.findUnique({ where: { id: foreign.id } });
    check(
      "Дилер не аннулирует чужую лицензию",
      r6.status === 403 && afterCancel?.status === foreign.status,
      `${r6.status}, статус ${afterCancel?.status}`,
    );
  }

  const cabinet = await dealer.raw("/admin/licenses");
  const location = cabinet.headers.get("location") ?? "";
  check(
    "Дилер не попадает в админский кабинет",
    cabinet.status >= 300 && cabinet.status < 400 && location.includes("/dealer"),
    `${cabinet.status} → ${location || "без редиректа"}`,
  );
}

async function testAdminStillWorks(admin: Session) {
  section("Администратор не потерял доступ");

  for (const path of ["/admin", "/admin/licenses", "/admin/dealers", "/admin/payments"]) {
    const res = await admin.raw(path);
    check(
      `Страница ${path} открывается`,
      res.status === 200,
      `${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`,
    );
  }
}

// ───────────────────────── уборка ─────────────────────────

async function cleanup(dealerId: string | null) {
  section("Уборка тестовых данных");

  const licenseIds = [...created.licenseIds];
  if (dealerId) {
    const extra = await prisma.license.findMany({
      where: { dealerId },
      select: { id: true, deviceIdKey: true, licenseKey: true },
    });
    for (const l of extra) {
      licenseIds.push(l.id);
      if (l.deviceIdKey) created.s3Keys.add(l.deviceIdKey);
      if (l.licenseKey) created.s3Keys.add(l.licenseKey);
    }
  }
  const uniqueLicenses = [...new Set(licenseIds)];

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { id: { in: [...created.paymentIds] } },
        { licenseId: { in: uniqueLicenses } },
        ...(dealerId ? [{ dealerId }] : []),
      ],
    },
    select: { id: true },
  });

  // Только то, что породил прогон: чужие уведомления не трогаем.
  await prisma.appNotification.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
  await prisma.cancellationRequest.deleteMany({
    where: {
      OR: [
        { licenseId: { in: uniqueLicenses } },
        ...(dealerId ? [{ requestedById: dealerId }] : []),
      ],
    },
  });
  // Журнал ссылается на автора с RESTRICT — иначе пользователь не удалится.
  await prisma.licenseAuditLog.deleteMany({
    where: {
      OR: [{ licenseId: { in: uniqueLicenses } }, ...(dealerId ? [{ actorId: dealerId }] : [])],
    },
  });
  await prisma.license.deleteMany({ where: { id: { in: uniqueLicenses } } });

  let removed = 0;
  for (const key of created.s3Keys) {
    try {
      await deleteObject(key);
      removed += 1;
    } catch {
      /* объекта могло не быть */
    }
  }

  await prisma.adminAuditLog.deleteMany({ where: { createdAt: { gte: startedAt } } });
  if (dealerId) {
    await prisma.dealerProfile.deleteMany({ where: { userId: dealerId } });
    await prisma.user.deleteMany({ where: { id: dealerId } });
  }

  pass(
    "Тестовые записи удалены",
    `лицензий ${uniqueLicenses.length}, счетов ${payments.length}, файлов в S3 ${removed}`,
  );
}

// ───────────────────────── запуск ─────────────────────────

async function main() {
  console.log(`\x1b[1mСквозной прогон\x1b[0m  портал: ${BASE}`);

  const mock = await startMockDriveMods(MOCK_PORT);
  console.log(`  заглушка генератора: http://127.0.0.1:${MOCK_PORT}`);

  let dealerId: string | null = null;
  try {
    const health = await fetch(`${BASE}/api/auth/csrf`).catch(() => null);
    if (!health?.ok) {
      console.error(`\nПортал не отвечает на ${BASE}. Запустите его перед прогоном.`);
      process.exit(1);
    }

    dealerId = await ensureTestDealer();

    const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const dealer = await login(TEST_DEALER_EMAIL, TEST_DEALER_PASSWORD);
    if (!admin) throw new Error(`Не удалось войти администратором ${ADMIN_EMAIL}`);
    if (!dealer) throw new Error("Не удалось войти тестовым представителем");

    await testAuthGate();
    await testGeneration(dealer, dealerId);
    await testConcurrentLimit(dealer, dealerId);
    await testRollback(dealer, dealerId);
    await testValidation(dealer);
    await testFreeIssue(dealer, admin);
    await testLicenseEditRights(dealer, admin, dealerId);
    await testDealerCannotTouchOthers(dealer, dealerId);
    await testAdminStillWorks(admin);
    await testPayments(dealer, admin, dealerId);
    await testCronAndWebhook();
    await testNotificationsAndAudit(admin, dealerId);
  } finally {
    await cleanup(dealerId).catch((e) => console.error("Уборка не удалась:", e));
    mock.close();
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => r.state === "fail");
  const passed = results.filter((r) => r.state === "pass");
  const skipped = results.filter((r) => r.state === "skip");

  section("Итог");
  console.log(`  пройдено ${passed.length}, провалено ${failed.length}, пропущено ${skipped.length}`);
  if (failed.length) {
    console.log("\n  Провалы:");
    for (const f of failed) console.log(`   \x1b[31m✗\x1b[0m ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
