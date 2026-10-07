-- CreateTable
-- Claude Code のプロファイル（CLAUDE_CONFIG_DIR）。実体は ~/.tsunagi/claude-profiles/<slug>/
CREATE TABLE "claude_profiles" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 認証はプロファイル（claude auth login）に一本化したため、Settings で登録していたトークンは削除する
DELETE FROM "environment_variables" WHERE "key" IN ('ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN');
