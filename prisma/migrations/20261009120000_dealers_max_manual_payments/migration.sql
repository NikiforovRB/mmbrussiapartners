-- Уведомления в MAX
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'MAX';

ALTER TABLE "User"
  ADD COLUMN "notifyByMax" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxUserId" TEXT,
  ADD COLUMN "maxName" TEXT,
  ADD COLUMN "maxLinkedAt" TIMESTAMP(3),
  ADD COLUMN "maxLinkCode" TEXT,
  ADD COLUMN "maxLinkCodeExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_maxLinkCode_key" ON "User"("maxLinkCode");

-- Профиль дилера: ник в Telegram и сайт компании
ALTER TABLE "DealerProfile"
  ADD COLUMN "telegramNick" TEXT,
  ADD COLUMN "companyUrl" TEXT;

-- Заявки дилера: аннулирование или возврат
CREATE TYPE "CancellationRequestKind" AS ENUM ('CANCEL', 'REFUND');
ALTER TABLE "CancellationRequest"
  ADD COLUMN "kind" "CancellationRequestKind" NOT NULL DEFAULT 'CANCEL',
  ADD COLUMN "clientRefused" BOOLEAN NOT NULL DEFAULT false;

-- Оплата, отмеченная администратором: без чека и без возврата через АТОЛ Pay
ALTER TABLE "Payment" ADD COLUMN "paidManually" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Payment" SET "paidManually" = true
WHERE "confirmedById" IS NOT NULL AND "status" IN ('PAID', 'REFUNDED');

ALTER TABLE "LegacyRecord"
  ADD COLUMN "manualPayment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manualPaidAt" TIMESTAMP(3),
  ADD COLUMN "manualPaidById" TEXT;

-- «Представитель» → «Дилер»
UPDATE "Role" SET "name" = 'Дилер'
WHERE "name" = 'Представитель' AND NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Дилер');

UPDATE "CompanySettings"
SET "homepage" = replace("homepage"::text, 'кабинет представителей', 'кабинет дилеров')::jsonb
WHERE "homepage"::text LIKE '%кабинет представителей%';

-- Регион продукта у лицензий без него: регион единственной позиции
-- справочника с тем же продуктом и комплектацией.
UPDATE "License" l
SET "productRegion" = p."region"
FROM (
  SELECT "product", "bundle", min("region") AS "region"
  FROM "PriceListItem"
  GROUP BY "product", "bundle"
  HAVING count(*) = 1 AND min("region") <> ''
) p
WHERE coalesce(trim(l."productRegion"), '') = ''
  AND upper(trim(l."product")) = p."product"
  AND upper(coalesce(trim(l."bundle"), '')) = p."bundle";

-- Иначе — код рынка из версии ПО: KA4.KOR.S5W_M.V → KOR.
UPDATE "License"
SET "productRegion" = upper(split_part("versionSoftware", '.', 2))
WHERE coalesce(trim("productRegion"), '') = ''
  AND upper(split_part("versionSoftware", '.', 2)) ~ '^[A-Z]{3}$';

-- Базовая цена по позиции справочника (точная тройка или общая для всех регионов).
UPDATE "License" l
SET "basePrice" = i."myPrice"
FROM "PriceListItem" i
WHERE l."basePrice" IS NULL
  AND i."myPrice" IS NOT NULL
  AND upper(trim(l."product")) = i."product"
  AND upper(coalesce(trim(l."bundle"), '')) = i."bundle"
  AND (upper(coalesce(trim(l."productRegion"), '')) = i."region" OR i."region" = '');
