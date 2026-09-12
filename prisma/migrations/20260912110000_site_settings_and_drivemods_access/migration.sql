-- Настройки сайта: объявление под шапкой и раздел техподдержки.
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "announcement" JSONB;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "support" JSONB;

-- Отметка доступа представителя к личному кабинету DriveMods.
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "driveModsAccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "driveModsRequestedAt" TIMESTAMP(3);
