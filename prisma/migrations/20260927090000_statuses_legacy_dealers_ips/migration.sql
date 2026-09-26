-- Лицензия бывает только активной или аннулированной: отзыв, истечение и
-- черновики портал не использует.
UPDATE "License" SET "status" = 'CANCELLED' WHERE "status" = 'REVOKED';
UPDATE "License" SET "status" = 'ACTIVE' WHERE "status" IN ('DRAFT', 'EXPIRED');

ALTER TYPE "LicenseStatus" RENAME TO "LicenseStatus_old";
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'CANCELLED');
ALTER TABLE "License" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "License" ALTER COLUMN "status" TYPE "LicenseStatus" USING ("status"::text::"LicenseStatus");
ALTER TABLE "License" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "LicenseStatus_old";

UPDATE "Role"
SET "permissions" = array_remove("permissions", 'licenses.revoke')
WHERE 'licenses.revoke' = ANY ("permissions");

-- После возврата денег лицензия не действует.
UPDATE "License" l
SET "status" = 'CANCELLED',
    "cancelledAt" = COALESCE(l."cancelledAt", p."refundedAt", CURRENT_TIMESTAMP),
    "cancellationReason" = COALESCE(l."cancellationReason", 'Возврат средств')
FROM "Payment" p
WHERE p."licenseId" = l."id"
  AND p."status" = 'REFUNDED'
  AND l."status" = 'ACTIVE';

ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED' AFTER 'PAYMENT_PAID';

-- Базовая цена позиции на момент выдачи; для прошлых лицензий — по справочнику.
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "basePrice" DECIMAL(12,2);

UPDATE "License" l
SET "basePrice" = p."myPrice"
FROM "PriceListItem" p
WHERE l."basePrice" IS NULL
  AND p."myPrice" IS NOT NULL
  AND p."product" = UPPER(TRIM(COALESCE(l."product", '')))
  AND p."bundle" = UPPER(TRIM(COALESCE(l."bundle", '')))
  AND p."region" = UPPER(TRIM(COALESCE(l."productRegion", '')));

ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "legacyDealer" BOOLEAN NOT NULL DEFAULT false;

-- Уведомления админской ленты (ссылки на /admin) уходили и представителям:
-- рассылка по праву licenses.view задевала всех дилеров.
DELETE FROM "AppNotification" n
USING "User" u
JOIN "Role" r ON r."id" = u."roleId"
WHERE n."userId" = u."id"
  AND NOT u."isSuperAdmin"
  AND n."link" LIKE '/admin/%'
  AND NOT (r."permissions" && ARRAY[
    'dealers.view', 'dealers.approve', 'dealers.edit', 'dealers.suspend',
    'dealers.setLimit', 'dealers.delete', 'dealers.passwords',
    'licenses.manageTerms', 'licenses.cancel', 'licenses.delete',
    'licenses.restore', 'licenses.issueFree', 'roles.manage', 'users.manage',
    'reports.export', 'stats.view', 'geo.view', 'payments.manage',
    'payments.refund', 'pricing.manage', 'settings.edit', 'auditLog.view',
    'templates.edit'
  ]::text[]);

CREATE TABLE IF NOT EXISTS "UserIp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserIp_userId_ip_key" ON "UserIp"("userId", "ip");
CREATE INDEX IF NOT EXISTS "UserIp_userId_lastSeenAt_idx" ON "UserIp"("userId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "UserIp_ip_idx" ON "UserIp"("ip");

ALTER TABLE "UserIp" ADD CONSTRAINT "UserIp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "LegacyDealer" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "country" TEXT,
    "registeredAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "licenses" INTEGER NOT NULL DEFAULT 0,
    "viaAccount" INTEGER NOT NULL DEFAULT 0,
    "viaComment" INTEGER NOT NULL DEFAULT 0,
    "paidLicenses" INTEGER NOT NULL DEFAULT 0,
    "unpaidLicenses" INTEGER NOT NULL DEFAULT 0,
    "amountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountUnpaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "firstLicenseAt" TIMESTAMP(3),
    "lastLicenseAt" TIMESTAMP(3),
    "products" JSONB NOT NULL DEFAULT '[]',
    "comments" JSONB NOT NULL DEFAULT '[]',
    "userId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyDealer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegacyDealer_externalKey_key" ON "LegacyDealer"("externalKey");
CREATE UNIQUE INDEX IF NOT EXISTS "LegacyDealer_userId_key" ON "LegacyDealer"("userId");
CREATE INDEX IF NOT EXISTS "LegacyDealer_source_idx" ON "LegacyDealer"("source");
CREATE INDEX IF NOT EXISTS "LegacyDealer_email_idx" ON "LegacyDealer"("email");
CREATE INDEX IF NOT EXISTS "LegacyDealer_phone_idx" ON "LegacyDealer"("phone");

ALTER TABLE "LegacyDealer" ADD CONSTRAINT "LegacyDealer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
