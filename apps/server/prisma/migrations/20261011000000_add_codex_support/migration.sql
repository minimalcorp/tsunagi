-- AlterTable
-- エージェント側のセッションID（Codex の thread id）。resume に使う
ALTER TABLE "tabs" ADD COLUMN "agent_session_id" TEXT;

-- CreateTable
-- Claude 専用だったプロファイルをエージェントごとに一般化する（既存行は claude として移行）
CREATE TABLE "agent_profiles" (
    "agent" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("agent", "slug")
);

INSERT INTO "agent_profiles" ("agent", "slug", "name", "created_at")
SELECT 'claude', "slug", "name", "created_at" FROM "claude_profiles";

-- DropTable
DROP TABLE "claude_profiles";
