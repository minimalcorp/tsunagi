/*
  Warnings:

  - You are about to drop the column `plan` on the `tasks` table. All the data in the column will be lost.
  - Added the required column `base_branch` to the `tasks` table without a default value. This is not possible if the table is not empty.

*/
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
    "requirement" TEXT,
    "design" TEXT,
    "procedure" TEXT,
    "pull_request_url" TEXT,
    "completed_at" DATETIME,
    "effort" INTEGER,
    "order" INTEGER,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tasks" ("branch", "created_at", "deleted_at", "description", "effort", "id", "order", "owner", "repo", "repo_id", "status", "title", "updated_at", "worktree_status", "base_branch", "requirement") SELECT "branch", "created_at", "deleted_at", "description", "effort", "id", "order", "owner", "repo", "repo_id", "status", "title", "updated_at", "worktree_status", 'main', "plan" FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
CREATE INDEX "tasks_owner_repo_idx" ON "tasks"("owner", "repo");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
