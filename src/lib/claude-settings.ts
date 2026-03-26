import * as fs from 'fs';
import * as path from 'path';

const HOOK_COMMAND =
  "curl -s -X POST http://localhost:2792/hooks/claude -H 'Content-Type: application/json' -d @-";

const hook = [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }];

// 全イベントを個別に列挙（ワイルドカード未対応のため）
const HOOKS_CONFIG = {
  SessionStart: hook,
  SessionEnd: hook,
  UserPromptSubmit: hook,
  PreToolUse: hook,
  PostToolUse: hook,
  PostToolUseFailure: hook,
  PermissionRequest: hook,
  Notification: hook,
  Stop: hook,
  StopFailure: hook,
  SubagentStart: hook,
  SubagentStop: hook,
  TeammateIdle: hook,
  TaskCompleted: hook,
  InstructionsLoaded: hook,
  ConfigChange: hook,
  WorktreeCreate: hook,
  WorktreeRemove: hook,
  PreCompact: hook,
  PostCompact: hook,
  Elicitation: hook,
  ElicitationResult: hook,
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
