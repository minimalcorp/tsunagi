-- AlterTable
-- タブの起動モード（'terminal' | 'claude'）を永続化する。
-- 既存タブは従来動作（claude自動起動）を維持するため 'claude' を既定値とする。
ALTER TABLE "tabs" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'claude';
