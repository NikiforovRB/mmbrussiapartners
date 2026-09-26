-- Публикация телефона представителя в «Дилерской сети» mmbrussia.ru:
-- заявка, одобрение администратором, отправка на сайт.
DO $$ BEGIN
    CREATE TYPE "SitePublicationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'SITE_PUBLICATION_REQUESTED';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'SITE_PUBLICATION_REVIEWED';

ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteComment" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "sitePublication" "SitePublicationStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "sitePublicationAt" TIMESTAMP(3);
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "sitePublicationById" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "sitePublicationNote" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteListed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteSyncedAt" TIMESTAMP(3);
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteSyncStatus" TEXT;
ALTER TABLE "DealerProfile" ADD COLUMN IF NOT EXISTS "siteSyncMessage" TEXT;

CREATE INDEX IF NOT EXISTS "DealerProfile_sitePublication_idx" ON "DealerProfile"("sitePublication");

-- Раньше тоггл публиковал телефон без модерации. Такие телефоны становятся
-- заявками: на сайт уйдут только те, что одобрит администратор.
UPDATE "DealerProfile"
SET "sitePublication" = 'PENDING', "sitePublicationAt" = CURRENT_TIMESTAMP
WHERE "phoneVisibleOnSite" = true AND "sitePublication" = 'NONE';

CREATE TABLE IF NOT EXISTS "SiteSyncLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "dealers" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "warnings" JSONB,
    "problems" JSONB,
    "error" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteSyncLog_createdAt_idx" ON "SiteSyncLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SiteSyncLog_action_dryRun_createdAt_idx" ON "SiteSyncLog"("action", "dryRun", "createdAt");
