import * as fs from 'fs';
import * as path from 'path';

const HOOK_COMMAND =
  "curl -s -X POST http://localhost:2792/hooks/claude -H 'Content-Type: application/json' -d @-";

const HOOKS_CONFIG = {
  SessionStart: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
  PreToolUse: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
  PostToolUse: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
  Stop: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
  StopFailure: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
};

/**
 * worktreeの .claude/settings.local.json にhooks設定を生成する
 * 既存ファイルがある場合はhooksセクションのみ上書きする
 */
export function generateSettingsLocalJson(worktreePath: string): void {
  const claudeDir = path.join(worktreePath, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');

  // .claude/ ディレクトリがなければ作成
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // 既存ファイルがあれば読み込み、なければ空オブジェクト
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // パースエラーは無視して上書き
    }
  }

  const updated = { ...existing, hooks: HOOKS_CONFIG };
  fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf-8');
}
