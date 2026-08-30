-- CreateEnum
CREATE TYPE "PriceAdjustKind" AS ENUM ('NONE', 'PERCENT', 'FIXED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRICE';

-- AlterTable
ALTER TABLE "DealerProfile" ADD COLUMN     "priceAdjustKind" "PriceAdjustKind" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "priceAdjustValue" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "bundle" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerPrice" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceListItem_product_idx" ON "PriceListItem"("product");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_product_bundle_region_key" ON "PriceListItem"("product", "bundle", "region");

-- CreateIndex
CREATE INDEX "DealerPrice_dealerId_idx" ON "DealerPrice"("dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerPrice_dealerId_itemId_key" ON "DealerPrice"("dealerId", "itemId");

-- AddForeignKey
ALTER TABLE "DealerPrice" ADD CONSTRAINT "DealerPrice_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPrice" ADD CONSTRAINT "DealerPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
