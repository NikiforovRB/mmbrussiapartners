-- CreateEnum
CREATE TYPE "AppNotificationType" AS ENUM ('DEALER_REGISTERED', 'DEALER_APPROVED', 'DEALER_REJECTED', 'DEALER_SUSPENDED', 'LICENSE_ISSUED', 'LICENSE_CANCELLED', 'LICENSE_REVOKED', 'CANCELLATION_REQUESTED', 'CANCELLATION_REVIEWED', 'PAYMENT_CREATED', 'PAYMENT_PAID', 'RECEIPT_FAILED');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('DEALER', 'ROLE', 'PAYMENT', 'SETTINGS');

-- AlterTable
ALTER TABLE "License" ALTER COLUMN "termEnd" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AppNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppNotification_userId_createdAt_idx" ON "AppNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_userId_readAt_idx" ON "AppNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_entity_entityId_idx" ON "AdminAuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_createdAt_idx" ON "CancellationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "License_deletedAt_createdAt_idx" ON "License"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "License_dealerId_createdAt_idx" ON "License"("dealerId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenseAuditLog_createdAt_idx" ON "LicenseAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "LicenseAuditLog_actorId_createdAt_idx" ON "LicenseAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_dealerId_createdAt_idx" ON "Payment"("dealerId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
