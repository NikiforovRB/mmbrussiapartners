import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ALL_PERMISSIONS = [
  "dealers.view",
  "dealers.approve",
  "dealers.edit",
  "dealers.suspend",
  "dealers.setLimit",
  "licenses.view",
  "licenses.create",
  "licenses.edit",
  "licenses.cancel",
  "licenses.revoke",
  "licenses.delete",
  "licenses.restore",
  "roles.manage",
  "users.manage",
  "reports.view",
  "reports.export",
  "stats.view",
  "geo.view",
  "payments.view",
  "payments.manage",
  "payments.refund",
  "settings.edit",
  "auditLog.view",
  "templates.edit",
];

const DEALER_PERMISSIONS = [
  "licenses.view",
  "licenses.create",
  "licenses.edit",
  "licenses.cancel",
  "reports.view",
  "payments.view",
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const adminRole = await prisma.role.upsert({
      where: { name: "Администратор" },
      update: { permissions: ALL_PERMISSIONS, isSystem: true },
      create: {
        name: "Администратор",
        description: "Системная роль с полным доступом",
        isSystem: true,
        permissions: ALL_PERMISSIONS,
      },
    });

    const dealerRole = await prisma.role.upsert({
      where: { name: "Представитель" },
      update: { permissions: DEALER_PERMISSIONS, isSystem: true },
      create: {
        name: "Представитель",
        description: "Системная роль для дилеров",
        isSystem: true,
        permissions: DEALER_PERMISSIONS,
      },
    });

    await prisma.companySettings.upsert({
      where: { id: "singleton" },
      update: {
        phone: process.env.COMPANY_PHONE ?? "8 (925) 037-46-66",
        email: process.env.COMPANY_EMAIL ?? "marat@mmbrussia.ru",
      },
      create: {
        id: "singleton",
        phone: process.env.COMPANY_PHONE ?? "8 (925) 037-46-66",
        email: process.env.COMPANY_EMAIL ?? "marat@mmbrussia.ru",
        publicPhones: [],
      },
    });

    const passwordHash = await bcrypt.hash("1vngbwxcn824", 12);
    const admin = await prisma.user.upsert({
      where: { email: "nikiforovrb@yandex.ru" },
      update: {
        passwordHash,
        status: "APPROVED",
        isSuperAdmin: true,
        roleId: adminRole.id,
      },
      create: {
        email: "nikiforovrb@yandex.ru",
        passwordHash,
        status: "APPROVED",
        isSuperAdmin: true,
        roleId: adminRole.id,
      },
    });

    await prisma.dealerProfile.upsert({
      where: { userId: admin.id },
      update: {},
      create: {
        userId: admin.id,
        firstName: "Никифоров",
        lastName: "Р. Б.",
        phone: "+7 925 037-46-66",
        organization: "MMB RUSSIA",
        city: "Москва",
        region: "Москва",
        licenseLimit: 9999,
      },
    });

    await prisma.emailTemplate.upsert({
      where: { key: "dealer_approved" },
      update: {},
      create: {
        key: "dealer_approved",
        subject: "Ваш аккаунт MMB RUSSIA одобрен",
        html: "<p>Здравствуйте, {{firstName}}!</p><p>Ваш аккаунт одобрен. Добро пожаловать в личный кабинет MMB RUSSIA.</p>",
        variables: ["firstName"],
      },
    });

    await prisma.emailTemplate.upsert({
      where: { key: "license_cancelled" },
      update: {},
      create: {
        key: "license_cancelled",
        subject: "Лицензия {{licenseNumber}} аннулирована",
        html: "<p>Лицензия {{licenseNumber}} была аннулирована. Причина: {{reason}}.</p>",
        variables: ["licenseNumber", "reason"],
      },
    });

    console.log("Seed: ok. Roles:", adminRole.name, dealerRole.name);
    console.log("Seed: admin =", admin.email);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
