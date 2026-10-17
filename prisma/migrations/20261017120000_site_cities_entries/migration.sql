-- Города публикации, отличные от города профиля, и снимок записей сайта с телефоном дилера.
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteCities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteEntries" JSONB;
