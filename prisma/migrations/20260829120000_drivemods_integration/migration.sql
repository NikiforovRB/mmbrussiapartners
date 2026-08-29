-- License.type: enum LicenseType -> TEXT (values: Генерация / Обновление / Восстановление)
ALTER TABLE "License" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "License" ALTER COLUMN "type" TYPE TEXT USING (
  CASE "type"::text
    WHEN 'ECO' THEN 'Генерация'
    WHEN 'FULL' THEN 'Генерация'
    WHEN 'CUSTOM' THEN 'Генерация'
    ELSE "type"::text
  END
);
ALTER TABLE "License" ALTER COLUMN "type" SET DEFAULT 'Генерация';

DROP TYPE IF EXISTS "LicenseType";

-- New license fields for DriveMods integration
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "product" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "bundle" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "productRegion" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "versionSoftware" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "versionCustom" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "dealerComment" TEXT;

-- Dealer signup (parent) geo
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "signupCountry" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "signupCity" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "signupIp" TEXT;
