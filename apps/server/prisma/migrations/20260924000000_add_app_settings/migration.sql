-- CreateTable
-- アプリ全体の設定（例: key='ollama' に実験的機能 Ollama の設定JSON）
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);
