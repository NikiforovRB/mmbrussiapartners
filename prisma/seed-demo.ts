import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const DEMO_EMAIL_DOMAIN = "@demo.mmbrussia.ru";
const DEMO_LICENSE_PREFIX = "MMB-DEMO-";
const DEMO_PASSWORD = "demo12345";

const PLATFORMS = ["Android", "Linux", "QNX", "WinCE", "Универсальная"];
const REGIONS: [string, string][] = [
  ["Москва", "Москва"],
  ["Санкт-Петербург", "Санкт-Петербург"],
  ["Татарстан", "Казань"],
  ["Свердловская обл.", "Екатеринбург"],
  ["Новосибирская обл.", "Новосибирск"],
  ["Краснодарский край", "Краснодар"],
];
const CUSTOMER_NAMES = [
  "Иванов Иван Иванович",
  "Петров Пётр Петрович",
  "Сидорова Анна Сергеевна",
  "Кузнецов Дмитрий Олегович",
  "Смирнова Елена Викторовна",
  "Волков Артём Николаевич",
  "Морозов Илья Андреевич",
  "Новикова Мария Павловна",
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function atTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}
function deviceHex(): string {
  return crypto.randomBytes(16).toString("hex");
}
function licenseNumber(seq: number): string {
  return `${DEMO_LICENSE_PREFIX}${String(seq).padStart(4, "0")}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const dealerRole = await prisma.role.findUnique({ where: { name: "Представитель" } });
    const adminRole = await prisma.role.findUnique({ where: { name: "Администратор" } });
    if (!dealerRole || !adminRole) {
      throw new Error("Базовые роли не найдены. Сначала запустите основной seed (npm run db:seed).");
    }

    // ---- Cleanup previous demo data (idempotent) ----
    const prevUsers = await prisma.user.findMany({
      where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
      select: { id: true },
    });
    const prevUserIds = prevUsers.map((u) => u.id);
    const prevLicenses = await prisma.license.findMany({
      where: { number: { startsWith: DEMO_LICENSE_PREFIX } },
      select: { id: true },
    });
    const prevLicenseIds = prevLicenses.map((l) => l.id);

    await prisma.cancellationRequest.deleteMany({
      where: {
        OR: [
          { licenseId: { in: prevLicenseIds } },
          { requestedById: { in: prevUserIds } },
        ],
      },
    });
    await prisma.payment.deleteMany({
      where: {
        OR: [{ dealerId: { in: prevUserIds } }, { licenseId: { in: prevLicenseIds } }],
      },
    });
    await prisma.licenseAuditLog.deleteMany({
      where: {
        OR: [{ licenseId: { in: prevLicenseIds } }, { actorId: { in: prevUserIds } }],
      },
    });
    await prisma.license.deleteMany({ where: { number: { startsWith: DEMO_LICENSE_PREFIX } } });
    await prisma.notificationLog.deleteMany({
      where: { recipient: { endsWith: DEMO_EMAIL_DOMAIN } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // ---- Dealers in various statuses ----
    const dealerSpecs = [
      {
        key: "dealer",
        email: `dealer${DEMO_EMAIL_DOMAIN}`,
        firstName: "Алексей",
        lastName: "Соколов",
        middleName: "Игоревич",
        organization: 'ООО "АвтоМедиа"',
        status: "APPROVED" as const,
        region: 0,
        limit: 50,
        primary: true,
      },
      {
        key: "dealer2",
        email: `dealer2${DEMO_EMAIL_DOMAIN}`,
        firstName: "Ольга",
        lastName: "Романова",
        middleName: "Дмитриевна",
        organization: 'ИП Романова О.Д.',
        status: "APPROVED" as const,
        region: 1,
        limit: 30,
      },
      {
        key: "dealer3",
        email: `dealer3${DEMO_EMAIL_DOMAIN}`,
        firstName: "Марат",
        lastName: "Хайруллин",
        middleName: null,
        organization: 'ООО "КазаньАвто"',
        status: "APPROVED" as const,
        region: 2,
        limit: 25,
      },
      {
        key: "pending",
        email: `pending${DEMO_EMAIL_DOMAIN}`,
        firstName: "Сергей",
        lastName: "Гаврилов",
        middleName: "Львович",
        organization: 'ООО "УралКарс"',
        status: "PENDING" as const,
        region: 3,
        limit: 0,
      },
      {
        key: "rejected",
        email: `rejected${DEMO_EMAIL_DOMAIN}`,
        firstName: "Николай",
        lastName: "Тимофеев",
        middleName: "Юрьевич",
        organization: null,
        status: "REJECTED" as const,
        region: 4,
        limit: 0,
      },
      {
        key: "suspended",
        email: `suspended${DEMO_EMAIL_DOMAIN}`,
        firstName: "Виктор",
        lastName: "Егоров",
        middleName: "Павлович",
        organization: 'ООО "ЮгМедиа"',
        status: "SUSPENDED" as const,
        region: 5,
        limit: 15,
      },
    ];

    const dealers: Record<string, { id: string; email: string }> = {};

    for (const spec of dealerSpecs) {
      const [region, city] = REGIONS[spec.region];
      const user = await prisma.user.create({
        data: {
          email: spec.email,
          passwordHash,
          status: spec.status,
          roleId: dealerRole.id,
          notifyByEmail: true,
          createdAt: daysAgo(45 - spec.region),
          dealerProfile: {
            create: {
              firstName: spec.firstName,
              lastName: spec.lastName,
              middleName: spec.middleName ?? undefined,
              organization: spec.organization ?? undefined,
              phone: `+7 9${spec.region}0 ${100 + spec.region}-45-67`,
              phoneVisibleOnSite: spec.status === "APPROVED",
              region,
              city,
              licenseLimit: spec.limit,
              licensesUsed: 0,
              rejectionReason:
                spec.status === "REJECTED" ? "Не пройдена проверка реквизитов организации." : undefined,
              approvedAt: spec.status === "APPROVED" ? daysAgo(40 - spec.region) : undefined,
            },
          },
        },
      });
      dealers[spec.key] = { id: user.id, email: user.email };
    }

    // ---- Licenses + audit + payments for approved dealers ----
    let seq = 1;
    const approvedKeys = ["dealer", "dealer2", "dealer3"];
    // license blueprint per approved dealer
    const perDealerPlans: Record<
      string,
      Array<{
        status: "ACTIVE" | "CANCELLED";
        type: "Генерация" | "Обновление" | "Восстановление";
        createdDaysAgo: number;
        withoutPayment?: boolean;
        payment?: "PAID" | "PENDING" | "FAILED" | "REFUNDED";
      }>
    > = {
      dealer: [
        { status: "ACTIVE", type: "Генерация", createdDaysAgo: 0, payment: "PAID" },
        { status: "ACTIVE", type: "Обновление", createdDaysAgo: 1, payment: "PAID" },
        { status: "ACTIVE", type: "Восстановление", createdDaysAgo: 3, withoutPayment: true },
        { status: "ACTIVE", type: "Генерация", createdDaysAgo: 6, payment: "PAID" },
        { status: "CANCELLED", type: "Генерация", createdDaysAgo: 20, payment: "REFUNDED" },
        { status: "ACTIVE", type: "Обновление", createdDaysAgo: 2, payment: "PENDING" },
      ],
      dealer2: [
        { status: "ACTIVE", type: "Генерация", createdDaysAgo: 5, payment: "PAID" },
        { status: "ACTIVE", type: "Обновление", createdDaysAgo: 8, payment: "PENDING" },
        { status: "ACTIVE", type: "Восстановление", createdDaysAgo: 12, payment: "PAID" },
        { status: "CANCELLED", type: "Генерация", createdDaysAgo: 15, payment: "FAILED" },
      ],
      dealer3: [
        { status: "ACTIVE", type: "Генерация", createdDaysAgo: 4, payment: "PAID" },
        { status: "ACTIVE", type: "Восстановление", createdDaysAgo: 10, withoutPayment: true },
        { status: "CANCELLED", type: "Обновление", createdDaysAgo: 30, payment: "PAID" },
      ],
    };

    // Продукт, пакет и регион DRIVEMODS присылает раздельно, и цена привязана
    // к этой тройке — демо-данные должны иметь ту же форму.
    const PRODUCTS: { product: string; bundle: string | null; region: string | null }[] = [
      { product: "HM-GEN5W", bundle: "FULL", region: "RUS" },
      { product: "MB-S5WM", bundle: "FULL", region: null },
      { product: "LG-GEN5", bundle: "CUSTOM", region: "RUS" },
      { product: "MB-S5WM-A9", bundle: "FULL", region: "RUS" },
    ];
    const VERSIONS_SW = [
      "SP3C.CHN.SOPL.V1.0.221130-SP3C-L3001C",
      "MQ422.KOR.SSW_M",
      "DL322.KOR.SSW_M",
      "SP2CPE.CHN.SSW_M.007.003.341221",
    ];
    const VERSIONS_CUSTOM = ["5.2.3", "5.5.3", "5.2.5", "6.6.1"];

    const createdLicenses: Record<string, { id: string; number: string; status: string }[]> = {
      dealer: [],
      dealer2: [],
      dealer3: [],
    };

    let custIdx = 0;
    for (const key of approvedKeys) {
      const dealer = dealers[key];
      const plans = perDealerPlans[key];
      let usedCount = 0;
      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        const created = atTime(daysAgo(plan.createdDaysAgo), 10 + (i % 8), (i * 7) % 60);
        const termStart = created;
        // Каждая четвёртая лицензия срочная — чтобы в демо были видны
        // и бессрочные записи, и напоминания об истечении.
        const termEnd =
          i % 4 === 3
            ? new Date(created.getFullYear() + 1, created.getMonth(), created.getDate())
            : null;
        const [region, city] = pick(REGIONS, i + Number(key.length));
        const number = licenseNumber(seq++);
        const dealerCityComment = `${dealers[key].email.split("@")[0]}, ${city}`;
        const license = await prisma.license.create({
          data: {
            number,
            dealerId: dealer.id,
            type: plan.type,
            status: plan.status,
            features: {},
            termStart,
            termEnd,
            deviceId: deviceHex(),
            licenseKey: `partners-portal/licenses/${number}-device-license.bin`,
            product: pick(PRODUCTS, i).product,
            bundle: pick(PRODUCTS, i).bundle,
            productRegion: pick(PRODUCTS, i).region,
            versionSoftware: pick(VERSIONS_SW, i),
            versionCustom: pick(VERSIONS_CUSTOM, i),
            dealerComment: dealerCityComment,
            customerFio: pick(CUSTOMER_NAMES, custIdx++),
            customerOrganization: i % 2 === 0 ? 'ООО "Клиент"' : null,
            customerEmail: `client${custIdx}@example.ru`,
            customerPhone: `+7 90${i} 000-00-0${i % 10}`,
            region,
            city,
            vehicleVin: `WDB${100000 + seq}`,
            vehicleModel: pick(["Mercedes E-class", "Toyota Camry", "Kia K5", "BMW X5"], i),
            platform: pick(PLATFORMS, i),
            issuedWithoutPayment: !!plan.withoutPayment,
            price: plan.withoutPayment ? null : 3000 + (i % 5) * 900,
            cancelledAt:
              plan.status === "CANCELLED"
                ? atTime(daysAgo(Math.max(0, plan.createdDaysAgo - 5)), 15, 0)
                : null,
            cancellationReason:
              plan.status === "CANCELLED" ? "Клиент вернул устройство" : null,
            createdAt: created,
          },
        });
        usedCount++;
        createdLicenses[key].push({ id: license.id, number: license.number, status: license.status });

        // audit: CREATED
        await prisma.licenseAuditLog.create({
          data: {
            licenseId: license.id,
            actorId: dealer.id,
            action: "CREATED",
            createdAt: created,
          },
        });
        // audit: extra events for the primary dealer to demo day-activity
        if (key === "dealer" && i === 0) {
          await prisma.licenseAuditLog.create({
            data: {
              licenseId: license.id,
              actorId: dealer.id,
              action: "EDITED",
              reason: "Обновлены данные клиента",
              createdAt: atTime(new Date(), 14, 30),
            },
          });
        }
        if (plan.status === "CANCELLED") {
          await prisma.licenseAuditLog.create({
            data: {
              licenseId: license.id,
              actorId: dealer.id,
              action: "CANCELLED",
              reason: "Клиент вернул устройство",
              createdAt: atTime(daysAgo(Math.max(0, plan.createdDaysAgo - 5)), 15, 0),
            },
          });
        }
        // payment
        if (plan.payment) {
          const settled = plan.payment === "PAID" || plan.payment === "REFUNDED";
          // Один из оплаченных оставляем без чека — чтобы в админке было
          // видно состояние «оплачено, чек не пробит».
          const receiptDone = settled && i % 4 !== 3;
          const fiscalNumber = 1000 + seq;
          await prisma.payment.create({
            data: {
              dealerId: dealer.id,
              licenseId: license.id,
              amount: 3000 + (i % 5) * 900,
              status: plan.payment,
              provider: "manual",
              description: `Оплата лицензии ${number}`,
              payUrl: `/dealer/payments`,
              paidAt: settled ? created : null,
              receiptStatus: settled ? (receiptDone ? "done" : "wait") : null,
              receiptUrl: receiptDone
                ? `https://consumer.1-ofd.ru/v1?fn=9288000100014915&i=${fiscalNumber}`
                : null,
              fiscalDocNumber: receiptDone ? String(fiscalNumber) : null,
              createdAt: created,
            },
          });
        }
      }
      await prisma.dealerProfile.update({
        where: { userId: dealer.id },
        data: { licensesUsed: usedCount },
      });
    }

    // ---- Cancellation requests in various statuses ----
    const primaryLic = createdLicenses.dealer;
    const activeLics = primaryLic.filter((l) => l.status === "ACTIVE");
    const cancelledLic = primaryLic.find((l) => l.status === "CANCELLED");

    if (activeLics[0]) {
      await prisma.cancellationRequest.create({
        data: {
          licenseId: activeLics[0].id,
          requestedById: dealers.dealer.id,
          reason: "Клиент отказался от устройства, просьба аннулировать лицензию.",
          status: "PENDING",
          createdAt: atTime(new Date(), 9, 15),
        },
      });
    }
    if (activeLics[1]) {
      await prisma.cancellationRequest.create({
        data: {
          licenseId: activeLics[1].id,
          requestedById: dealers.dealer.id,
          reason: "Ошибочно выбран тип лицензии.",
          status: "REJECTED",
          reviewNote: "Лицензия активно используется, аннулирование не требуется.",
          reviewedAt: daysAgo(1),
          createdAt: daysAgo(2),
        },
      });
    }
    if (cancelledLic) {
      await prisma.cancellationRequest.create({
        data: {
          licenseId: cancelledLic.id,
          requestedById: dealers.dealer.id,
          reason: "Клиент вернул устройство.",
          status: "APPROVED",
          reviewNote: "Подтверждено, лицензия аннулирована.",
          reviewedAt: daysAgo(14),
          createdAt: daysAgo(15),
        },
      });
    }
    // pending request from second dealer too
    const dealer2Active = createdLicenses.dealer2.find((l) => l.status === "ACTIVE");
    if (dealer2Active) {
      await prisma.cancellationRequest.create({
        data: {
          licenseId: dealer2Active.id,
          requestedById: dealers.dealer2.id,
          reason: "Дубликат лицензии, требуется аннулирование.",
          status: "PENDING",
          createdAt: daysAgo(1),
        },
      });
    }

    // ---- Notifications ----
    const notifStatuses: Array<"SENT" | "QUEUED" | "FAILED"> = ["SENT", "QUEUED", "FAILED"];
    for (let i = 0; i < 6; i++) {
      const dealerKey = approvedKeys[i % approvedKeys.length];
      await prisma.notificationLog.create({
        data: {
          userId: dealers[dealerKey].id,
          channel: i % 3 === 0 ? "TELEGRAM" : "EMAIL",
          recipient: dealers[dealerKey].email,
          subject: i % 2 === 0 ? "Лицензия сгенерирована" : "Заявка на аннулирование",
          body:
            i % 2 === 0
              ? "Лицензия успешно сгенерирована и готова к скачиванию."
              : "Поступила заявка на аннулирование лицензии.",
          status: notifStatuses[i % notifStatuses.length],
          error: notifStatuses[i % notifStatuses.length] === "FAILED" ? "SMTP timeout" : null,
          createdAt: daysAgo(i),
        },
      });
    }

    const totalLicenses = Object.values(createdLicenses).reduce((a, b) => a + b.length, 0);
    console.log("Demo seed OK:");
    console.log(`  dealers: ${dealerSpecs.length} (login: dealer${DEMO_EMAIL_DOMAIN} / ${DEMO_PASSWORD})`);
    console.log(`  licenses: ${totalLicenses}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
