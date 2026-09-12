-- База знаний: статьи с блочным контентом.
CREATE TABLE IF NOT EXISTS "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "excerpt" TEXT,
    "coverKey" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_published_createdAt_idx" ON "KnowledgeArticle"("published", "createdAt");
