-- AlterTable
-- mode='markdown'（Markdown Viewer）タブが表示するファイルの絶対パス。他 mode では NULL。
ALTER TABLE "tabs" ADD COLUMN "file_path" TEXT;
