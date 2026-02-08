-- CreateTable
CREATE TABLE IF NOT EXISTS "available_models" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "model_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "owner" TEXT,
    "repo" TEXT,
    "backlog_model" TEXT NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
    "planning_model" TEXT NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
    "coding_model" TEXT NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
    "reviewing_model" TEXT NOT NULL DEFAULT 'claude-3-opus-20240229',
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "model_settings_owner_repo_fkey" FOREIGN KEY ("owner", "repo") REFERENCES "repositories" ("owner", "repo") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "available_models_model_id_key" ON "available_models"("model_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "available_models_enabled_sort_order_idx" ON "available_models"("enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "model_settings_scope_owner_repo_key" ON "model_settings"("scope", "owner", "repo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "model_settings_scope_owner_repo_idx" ON "model_settings"("scope", "owner", "repo");

-- AlterTable
ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "model" TEXT;
