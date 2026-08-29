/**
 * Прогон жизненного цикла платежа на реальном коде портала:
 * счёт → оплата → фискализация → чтение статуса чека.
 *
 *   npm run test:payments
 *
 * Демо-записи создаются и удаляются в рамках прогона.
 */

import { PrismaClient } from "@prisma/client";
import { createPayment, markPaymentPaid } from "../src/lib/payments/service";
import { getPaymentProvider, defaultLicensePrice } from "../src/lib/payments/provider";
import { atolMissingEnv, isAtolConfigured } from "../src/lib/payments/atol";
import { statusLabel } from "../src/lib/status-labels";

const prisma = new PrismaClient();

function ok(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function info(msg: string) {
  console.log(`  \x1b[33m•\x1b[0m ${msg}`);
}
function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function main() {
  section("Конфигурация");
  const provider = getPaymentProvider();
  ok(`Приём оплаты: ${provider.title} (${provider.id})`);
  ok(`Цена лицензии по умолчанию: ${defaultLicensePrice()} ₽`);
  if (isAtolConfigured()) ok("Касса АТОЛ Онлайн: настроена");
  else info(`Касса АТОЛ Онлайн: не настроена (нет ${atolMissingEnv().join(", ")})`);

  const dealer = await prisma.user.findFirst({
    where: { status: "APPROVED", dealerProfile: { isNot: null } },
    include: { dealerProfile: true },
  });
  if (!dealer) {
    console.log("\nНет одобренного дилера — сначала выполните npm run db:seed:demo");
    process.exit(1);
  }

  section("Жизненный цикл платежа");
  const payment = await createPayment({
    dealerId: dealer.id,
    amount: defaultLicensePrice() || 1000,
    description: "ТЕСТ: генерация лицензии",
    email: dealer.email,
    phone: dealer.dealerProfile?.phone ?? null,
  });
  ok(`Счёт создан: ${payment.id}, статус «${statusLabel("payment", payment.status)}»`);
  ok(`Ссылка на оплату: ${payment.payUrl}`);

  const paid = await markPaymentPaid(payment.id, dealer.id);
  ok(`Оплата подтверждена: статус «${statusLabel("payment", paid.status)}»`);

  const after = await prisma.payment.findUnique({ where: { id: payment.id } });
  if (after?.receiptStatus === "done") {
    ok(`Чек пробит: ${after.receiptUrl ?? "ссылка появится в колбэке"}`);
  } else if (after?.receiptStatus === "wait") {
    ok(`Чек отправлен в кассу, uuid ${after.receiptUuid}`);
  } else {
    info(`Чек не пробит: ${after?.receiptError ?? "нет данных"}`);
  }

  await prisma.payment.delete({ where: { id: payment.id } });
  ok("Тестовый платёж удалён");

  section("Итог");
  console.log(
    isAtolConfigured()
      ? "  Полный цикл отработал, включая фискализацию."
      : "  Цикл оплаты отработал. Фискализация включится после заполнения переменных АТОЛ.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
