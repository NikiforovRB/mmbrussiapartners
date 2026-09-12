-- Ограничения генерации: окно запрета (техработы/период) и список устаревших
-- версий кастома, для которых генерация запрещена.
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "generation" JSONB;
