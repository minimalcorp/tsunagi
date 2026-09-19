-- AlterTable
-- 完了(success/error)したがタスク詳細で未確認のタブを示すフラグ。
-- 既存タブは全て確認済み扱いとするため backfill はしない。
ALTER TABLE "tabs" ADD COLUMN "unread" BOOLEAN NOT NULL DEFAULT false;
