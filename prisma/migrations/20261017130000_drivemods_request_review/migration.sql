-- Отказ по заявке на доступ к ЛК DriveMods: когда и почему.
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "driveModsRejectedAt" TIMESTAMP(3);
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "driveModsRejectReason" TEXT;
