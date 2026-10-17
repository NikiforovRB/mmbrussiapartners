-- Разделы уведомлений, которые администратор отключил у себя.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyMutedTabs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
