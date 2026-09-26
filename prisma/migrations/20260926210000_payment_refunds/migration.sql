-- Возврат средств по платежу: деньги через АТОЛ Pay (или вручную) и чек «Возврат прихода»
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundError" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReceiptUuid" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReceiptStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReceiptUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundFiscalDocNumber" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReceiptError" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReceiptAttempt" INTEGER NOT NULL DEFAULT 0;
