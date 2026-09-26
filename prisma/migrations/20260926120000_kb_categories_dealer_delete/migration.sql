-- Удаление представителей — отдельное право: сид переписывает права ролей
-- только при первом запуске, поэтому выдаём его существующей роли сами.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'dealers.delete')
WHERE "isSystem" = TRUE
  AND "name" = 'Администратор'
  AND NOT ('dealers.delete' = ANY ("permissions"));

-- Категории базы знаний: два уровня (категория и подкатегория).
CREATE TABLE IF NOT EXISTS "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeCategory_parentId_sortOrder_idx" ON "KnowledgeCategory"("parentId", "sortOrder");

DO $$ BEGIN
    ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeArticle_categoryId_idx" ON "KnowledgeArticle"("categoryId");

DO $$ BEGIN
    ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Прежний свободный «Раздел» статьи становится категорией верхнего уровня.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'KnowledgeArticle' AND column_name = 'category'
    ) THEN
        INSERT INTO "KnowledgeCategory" ("id", "name", "sortOrder", "updatedAt")
        SELECT 'kbc_' || md5(c.name), c.name, (row_number() OVER (ORDER BY c.name))::int, CURRENT_TIMESTAMP
        FROM (
            SELECT DISTINCT btrim("category") AS name
            FROM "KnowledgeArticle"
            WHERE "category" IS NOT NULL AND btrim("category") <> ''
        ) c
        ON CONFLICT ("id") DO NOTHING;

        UPDATE "KnowledgeArticle"
        SET "categoryId" = 'kbc_' || md5(btrim("category"))
        WHERE "categoryId" IS NULL AND "category" IS NOT NULL AND btrim("category") <> '';

        ALTER TABLE "KnowledgeArticle" DROP COLUMN "category";
    END IF;
END $$;

-- Пример структуры, чтобы было видно, как работает дерево.
INSERT INTO "KnowledgeCategory" ("id", "name", "parentId", "sortOrder", "updatedAt") VALUES
    ('kbc_test_category', 'Тестовая категория', NULL, 1000, CURRENT_TIMESTAMP),
    ('kbc_test_subcategory', 'Тестовая подкатегория', 'kbc_test_category', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
