-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "clone_url" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "repo_id" TEXT NOT NULL,
    "worktree_status" TEXT NOT NULL,
    "plan" TEXT,
    "effort" INTEGER,
    "order" INTEGER,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tabs" (
    "tab_id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "session_id" TEXT,
    "prompt_count" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tabs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "session_data" (
    "tab_id" TEXT NOT NULL PRIMARY KEY,
    "sdk_messages" TEXT NOT NULL,
    "prompts" TEXT NOT NULL,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "session_data_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "tabs" ("tab_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "environment_variables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "owner" TEXT,
    "repo" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "environment_variables_owner_repo_fkey" FOREIGN KEY ("owner", "repo") REFERENCES "repositories" ("owner", "repo") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "claude_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "owner" TEXT,
    "repo" TEXT,
    "sources" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "claude_settings_owner_repo_fkey" FOREIGN KEY ("owner", "repo") REFERENCES "repositories" ("owner", "repo") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "repositories_owner_repo_key" ON "repositories"("owner", "repo");

-- CreateIndex
CREATE INDEX "tasks_owner_repo_idx" ON "tasks"("owner", "repo");

-- CreateIndex
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");

-- CreateIndex
CREATE INDEX "tabs_task_id_idx" ON "tabs"("task_id");

-- CreateIndex
CREATE INDEX "environment_variables_scope_owner_repo_idx" ON "environment_variables"("scope", "owner", "repo");

-- CreateIndex
CREATE UNIQUE INDEX "environment_variables_key_scope_owner_repo_key" ON "environment_variables"("key", "scope", "owner", "repo");

-- CreateIndex
CREATE INDEX "claude_settings_scope_owner_repo_idx" ON "claude_settings"("scope", "owner", "repo");

-- CreateIndex
CREATE UNIQUE INDEX "claude_settings_scope_owner_repo_key" ON "claude_settings"("scope", "owner", "repo");
