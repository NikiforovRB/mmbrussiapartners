import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
// Единый источник списка прав: копия здесь однажды уже отстала от кода,
// и роль администратора осталась без недавно добавленного права.
import { ALL_PERMISSIONS, DEALER_SCOPE_PERMISSIONS } from "../src/lib/permissions";

// Представителю хватает прав на собственный кабинет: к своим лицензиям,
// отчётам и счетам доступ и так есть по владению. Право licenses.cancel
// ему выдавать нельзя — оно означает аннулирование любой лицензии сети.
const DEALER_PERMISSIONS = DEALER_SCOPE_PERMISSIONS;

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

    // Пароль существующего администратора сид не трогает. Новому — из
    // SEED_ADMIN_PASSWORD или случайный, который печатается один раз.
    const adminEmail = "nikiforovrb@yandex.ru";
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
    let generatedPassword: string | null = null;
    let passwordHash = "";
    if (!existingAdmin) {
      const plain = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
      if (!process.env.SEED_ADMIN_PASSWORD) generatedPassword = plain;
      passwordHash = await bcrypt.hash(plain, 12);
    }
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        status: "APPROVED",
        isSuperAdmin: true,
        roleId: adminRole.id,
      },
      create: {
        email: adminEmail,
        passwordHash,
        status: "APPROVED",
        isSuperAdmin: true,
        roleId: adminRole.id,
      },
    });
    if (generatedPassword) {
      console.log(`Первый администратор ${adminEmail}, пароль: ${generatedPassword} — смените после входа.`);
    }

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
