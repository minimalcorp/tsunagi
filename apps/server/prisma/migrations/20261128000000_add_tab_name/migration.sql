-- AlterTable
-- タブ名（ユーザー / MCP が付ける名前と、エージェントのセッションタイトルから自動で付く名前）
ALTER TABLE "tabs" ADD COLUMN "name" TEXT;
ALTER TABLE "tabs" ADD COLUMN "auto_name" TEXT;
