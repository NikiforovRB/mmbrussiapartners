-- Три цены на позицию справочника: наша (себестоимость) и клиентская (розница).
ALTER TABLE "PriceListItem" ADD COLUMN IF NOT EXISTS "myPrice" DECIMAL(12,2);
ALTER TABLE "PriceListItem" ADD COLUMN IF NOT EXISTS "clientPrice" DECIMAL(12,2);

-- Ценовой тариф представителя и режим расчётов (пред/постоплата).
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "priceTier" TEXT NOT NULL DEFAULT 'DEALER';
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "prepaid" BOOLEAN NOT NULL DEFAULT false;
