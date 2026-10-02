-- Разделы кабинета представителя и каналы уведомлений (настройки компании).
ALTER TABLE "CompanySettings" ADD COLUMN "notifications" JSONB,
ADD COLUMN "sections" JSONB;

-- Причина блокировки представителя.
ALTER TABLE "DealerProfile" ADD COLUMN "suspensionReason" TEXT;

-- Сумма из ЛК DriveMods; priceTotal пересчитывается по дилерскому справочнику.
ALTER TABLE "LegacyRecord" ADD COLUMN "priceLk" DECIMAL(14,2);
UPDATE "LegacyRecord" SET "priceLk" = "priceTotal" WHERE "priceLk" IS NULL;

-- Привязка Telegram через бота.
ALTER TABLE "User" ADD COLUMN "telegramLinkCode" TEXT,
ADD COLUMN "telegramLinkCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN "telegramLinkedAt" TIMESTAMP(3),
ADD COLUMN "telegramName" TEXT;

CREATE UNIQUE INDEX "User_telegramLinkCode_key" ON "User"("telegramLinkCode");
