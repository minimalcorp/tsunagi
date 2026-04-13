-- BackfillNullOrders
-- 既存の NULL order を createdAt 昇順で連番付与（既存の最大値の後ろから）
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM tasks
  WHERE "order" IS NULL AND deleted_at IS NULL
)
UPDATE tasks
SET "order" = (
  SELECT COALESCE(MAX("order"), -1) FROM tasks WHERE "order" IS NOT NULL AND deleted_at IS NULL
) + (SELECT rn FROM ranked WHERE ranked.id = tasks.id)
WHERE id IN (SELECT id FROM ranked);

-- 論理削除済みタスクにも 0 を入れておく（NOT NULL 制約のため）
UPDATE tasks SET "order" = 0 WHERE "order" IS NULL;

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
    "worktree_status" TEXT NOT NULL,
    "pull_request_url" TEXT,
    "effort" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tasks" ("id", "title", "description", "status", "owner", "repo", "branch", "base_branch", "repo_id", "worktree_status", "pull_request_url", "effort", "order", "deleted_at", "created_at", "updated_at") SELECT "id", "title", "description", "status", "owner", "repo", "branch", "base_branch", "repo_id", "worktree_status", "pull_request_url", "effort", "order", "deleted_at", "created_at", "updated_at" FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
CREATE INDEX "tasks_owner_repo_idx" ON "tasks"("owner", "repo");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
