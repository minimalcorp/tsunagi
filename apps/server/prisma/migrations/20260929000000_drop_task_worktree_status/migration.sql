-- DropColumn
-- worktree 作成に成功したタスクのみ登録する方針に変更したため worktree_status を廃止（既存レコードは変更しない）
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "base_branch" TEXT NOT NULL,
    "repo_id" TEXT NOT NULL,
    "pull_request_url" TEXT,
    "effort" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tasks" ("id", "title", "description", "status", "owner", "repo", "branch", "base_branch", "repo_id", "pull_request_url", "effort", "order", "deleted_at", "created_at", "updated_at") SELECT "id", "title", "description", "status", "owner", "repo", "branch", "base_branch", "repo_id", "pull_request_url", "effort", "order", "deleted_at", "created_at", "updated_at" FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
CREATE INDEX "tasks_owner_repo_idx" ON "tasks"("owner", "repo");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
