-- Уведомления при входе с обязательным подтверждением «Ознакомился».
CREATE TABLE IF NOT EXISTS "LoginNotice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requireAck" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LoginNoticeAck" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginNoticeAck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoginNotice_active_idx" ON "LoginNotice"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "LoginNoticeAck_noticeId_userId_key" ON "LoginNoticeAck"("noticeId", "userId");
CREATE INDEX IF NOT EXISTS "LoginNoticeAck_userId_idx" ON "LoginNoticeAck"("userId");

DO $$ BEGIN
    ALTER TABLE "LoginNoticeAck"
        ADD CONSTRAINT "LoginNoticeAck_noticeId_fkey"
        FOREIGN KEY ("noticeId") REFERENCES "LoginNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "LoginNoticeAck"
        ADD CONSTRAINT "LoginNoticeAck_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
