-- Пароль представителя в зашифрованном виде: ключ DEALER_PASSWORD_KEY лежит
-- только в окружении сервера. Прежние пароли известны лишь как хэш.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordEncrypted" TEXT;

-- Просмотр и смена паролей представителей - отдельное право.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'dealers.passwords')
WHERE "isSystem" = TRUE
  AND "name" = 'Администратор'
  AND NOT ('dealers.passwords' = ANY ("permissions"));

-- Повторная генерация бесплатна: неоплаченные счета по ней отменяются.
UPDATE "Payment" p
SET "status" = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "License" l
WHERE p."licenseId" = l."id"
  AND l."repeatGeneration" = TRUE
  AND p."status" IN ('PENDING', 'FAILED');

UPDATE "License" l
SET "price" = NULL
WHERE l."repeatGeneration" = TRUE
  AND l."price" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" p
    WHERE p."licenseId" = l."id" AND p."status" IN ('PAID', 'REFUNDED')
  );

-- Лимит считает только лицензии с неоплаченным счётом.
UPDATE "DealerProfile" dp
SET "licensesUsed" = (
  SELECT COUNT(*)
  FROM "License" l
  JOIN "Payment" p ON p."licenseId" = l."id"
  WHERE l."dealerId" = dp."userId"
    AND l."deletedAt" IS NULL
    AND l."status" IN ('DRAFT', 'ACTIVE', 'EXPIRED')
    AND p."status" IN ('PENDING', 'FAILED')
);
