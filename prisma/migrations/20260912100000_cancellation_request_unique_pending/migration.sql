-- Схлопываем возможные дубли активных заявок (оставляем самую свежую),
-- иначе частичный уникальный индекс не создастся.
UPDATE "CancellationRequest" c
SET "status" = 'REJECTED',
    "reviewNote" = COALESCE("reviewNote", 'Автоматически отклонена: дубликат активной заявки'),
    "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP)
WHERE c."status" = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM "CancellationRequest" c2
    WHERE c2."licenseId" = c."licenseId"
      AND c2."status" = 'PENDING'
      AND (c2."createdAt" > c."createdAt" OR (c2."createdAt" = c."createdAt" AND c2."id" > c."id"))
  );

-- Одна активная (PENDING) заявка на лицензию: частичный уникальный индекс
-- полностью исключает гонку при двойном клике на уровне БД.
CREATE UNIQUE INDEX IF NOT EXISTS "CancellationRequest_licenseId_pending_key"
  ON "CancellationRequest" ("licenseId")
  WHERE "status" = 'PENDING';
