-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "planner_tabs" (
    "tab_id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables (add todos column to tabs)
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
    "todos" TEXT DEFAULT '[]',
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tabs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tabs" ("tab_id", "task_id", "order", "status", "created_at", "started_at", "completed_at", "updated_at")
SELECT "tab_id", "task_id", "order", "status", "created_at", "started_at", "completed_at", "updated_at" FROM "tabs";
DROP TABLE "tabs";
ALTER TABLE "new_tabs" RENAME TO "tabs";
CREATE INDEX "tabs_task_id_idx" ON "tabs"("task_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
