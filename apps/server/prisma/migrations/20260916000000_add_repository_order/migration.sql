-- AlterTable
-- トップページのリポジトリ列を並び替え可能にするための表示順
ALTER TABLE "repositories" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill
-- 既存の表示順（owner/repo の昇順）をそのまま初期値にする
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY owner ASC, repo ASC) - 1 AS rn
  FROM repositories
)
UPDATE repositories
SET "order" = (SELECT rn FROM ranked WHERE ranked.id = repositories.id);
