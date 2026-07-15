-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CancellationRequestStatus') THEN
    CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END$$;

-- AlterTable
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "platform" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "issuedWithoutPayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CancellationRequest" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CancellationRequest_status_idx" ON "CancellationRequest"("status");
CREATE INDEX IF NOT EXISTS "CancellationRequest_licenseId_idx" ON "CancellationRequest"("licenseId");
CREATE INDEX IF NOT EXISTS "CancellationRequest_requestedById_idx" ON "CancellationRequest"("requestedById");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationRequest_licenseId_fkey') THEN
    ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationRequest_requestedById_fkey') THEN
    ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CancellationRequest_reviewedById_fkey') THEN
    ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
