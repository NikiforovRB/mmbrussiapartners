-- CreateTable
CREATE TABLE IF NOT EXISTS "HumaxPassword" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumaxPassword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HumaxPassword_dealerId_idx" ON "HumaxPassword"("dealerId");
CREATE INDEX IF NOT EXISTS "HumaxPassword_serial_idx" ON "HumaxPassword"("serial");
CREATE INDEX IF NOT EXISTS "HumaxPassword_dealerId_createdAt_idx" ON "HumaxPassword"("dealerId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HumaxPassword_dealerId_fkey') THEN
    ALTER TABLE "HumaxPassword" ADD CONSTRAINT "HumaxPassword_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;
