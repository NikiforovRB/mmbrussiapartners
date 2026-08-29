-- Приём оплаты: провайдер эквайринга и ссылка на оплату
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "payUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "confirmedById" TEXT;

-- Фискализация чека в АТОЛ Онлайн (54-ФЗ)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptUuid" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "fiscalDocNumber" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptError" TEXT;

-- Проставляем дату оплаты уже оплаченным записям
UPDATE "Payment" SET "paidAt" = "updatedAt" WHERE "status" = 'PAID' AND "paidAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Payment_receiptStatus_idx" ON "Payment"("receiptStatus");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_confirmedById_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_confirmedById_fkey"
      FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
