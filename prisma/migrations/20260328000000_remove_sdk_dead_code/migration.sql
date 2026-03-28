-- DropIndex
DROP INDEX IF EXISTS "claude_settings_scope_owner_repo_key";

-- DropIndex
DROP INDEX IF EXISTS "claude_settings_scope_owner_repo_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "claude_settings";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "session_data";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tabs" (
    "tab_id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tabs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tabs" ("completed_at", "created_at", "order", "started_at", "status", "tab_id", "task_id", "updated_at") SELECT "completed_at", "created_at", "order", "started_at", "status", "tab_id", "task_id", "updated_at" FROM "tabs";
DROP TABLE "tabs";
ALTER TABLE "new_tabs" RENAME TO "tabs";
CREATE INDEX "tabs_task_id_idx" ON "tabs"("task_id");
CREATE TABLE "new_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "base_branch" TEXT NOT NULL,
    "base_branch_commit" TEXT,
    "repo_id" TEXT NOT NULL,
    "worktree_status" TEXT NOT NULL,
    "pull_request_url" TEXT,
    "effort" INTEGER,
    "order" INTEGER,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tasks" ("base_branch", "base_branch_commit", "branch", "created_at", "deleted_at", "description", "effort", "id", "order", "owner", "pull_request_url", "repo", "repo_id", "status", "title", "updated_at", "worktree_status") SELECT "base_branch", "base_branch_commit", "branch", "created_at", "deleted_at", "description", "effort", "id", "order", "owner", "pull_request_url", "repo", "repo_id", "status", "title", "updated_at", "worktree_status" FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
CREATE INDEX "tasks_owner_repo_idx" ON "tasks"("owner", "repo");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
