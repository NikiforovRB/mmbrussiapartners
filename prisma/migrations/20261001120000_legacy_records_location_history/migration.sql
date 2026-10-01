-- Записи старого ЛК DriveMods и их распределение по представителям портала.
CREATE TYPE "LegacyRecordKind" AS ENUM ('LICENSE', 'PAYMENT', 'PASSWORD', 'SERVICE');

-- История страны, региона и города представителя.
CREATE TYPE "LocationChangeSource" AS ENUM ('SIGNUP_IP', 'DEALER', 'ADMIN');

ALTER TABLE "DealerProfile" ADD COLUMN "signupRegion" TEXT;

CREATE TABLE "LegacyRecord" (
    "id" TEXT NOT NULL,
    "kind" "LegacyRecordKind" NOT NULL,
    "lkType" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "licenseType" TEXT,
    "product" TEXT,
    "bundle" TEXT,
    "region" TEXT,
    "version" TEXT,
    "versionCustom" TEXT,
    "eolType" TEXT,
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "priceBase" DECIMAL(14,2),
    "priceTotal" DECIMAL(14,2),
    "discount" DECIMAL(14,2),
    "discountName" TEXT,
    "couponCode" TEXT,
    "paymentStatus" TEXT NOT NULL,
    "dealerComment" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "paidById" TEXT,
    "paidItems" INTEGER,
    "legacyDealerId" TEXT,
    "userId" TEXT,
    "manualAssign" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealerLocationChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "source" "LocationChangeSource" NOT NULL,
    "countryFrom" TEXT,
    "countryTo" TEXT,
    "regionFrom" TEXT,
    "regionTo" TEXT,
    "cityFrom" TEXT,
    "cityTo" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerLocationChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegacyRecord_kind_createdAt_idx" ON "LegacyRecord"("kind", "createdAt");
CREATE INDEX "LegacyRecord_legacyDealerId_kind_idx" ON "LegacyRecord"("legacyDealerId", "kind");
CREATE INDEX "LegacyRecord_userId_kind_createdAt_idx" ON "LegacyRecord"("userId", "kind", "createdAt");
CREATE INDEX "LegacyRecord_paidById_idx" ON "LegacyRecord"("paidById");
CREATE INDEX "DealerLocationChange_userId_createdAt_idx" ON "DealerLocationChange"("userId", "createdAt");

ALTER TABLE "LegacyRecord" ADD CONSTRAINT "LegacyRecord_legacyDealerId_fkey" FOREIGN KEY ("legacyDealerId") REFERENCES "LegacyDealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LegacyRecord" ADD CONSTRAINT "LegacyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LegacyRecord" ADD CONSTRAINT "LegacyRecord_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealerLocationChange" ADD CONSTRAINT "DealerLocationChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerLocationChange" ADD CONSTRAINT "DealerLocationChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
