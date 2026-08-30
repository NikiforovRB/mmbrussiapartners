-- Лицензия больше не привязана к клиенту и всегда бессрочная:
-- убираем поля клиента, транспортного средства, платформы и срока действия.

-- DropIndex
DROP INDEX "License_customerEmail_idx";

-- DropIndex
DROP INDEX "License_customerPhone_idx";

-- DropIndex
DROP INDEX "License_termEnd_idx";

-- AlterTable
ALTER TABLE "License" DROP COLUMN "customerEmail",
DROP COLUMN "customerFio",
DROP COLUMN "customerOrganization",
DROP COLUMN "customerPhone",
DROP COLUMN "platform",
DROP COLUMN "termEnd",
DROP COLUMN "termStart",
DROP COLUMN "vehicleModel",
DROP COLUMN "vehicleVin";
