// Task型
export interface Task {
  id: string; // UUID
  title: string;
  description: string;
  status: 'backlog' | 'planning' | 'coding' | 'reviewing' | 'done';
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string; // rebase/merge判定用のベースブランチ
  repoId: string; // Repository IDへの参照
  worktreeStatus: 'pending' | 'created' | 'error';

  // Pull Request情報
  pullRequestUrl?: string;

  effort?: number;
  order: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  tabs: Tab[]; // タブ管理（Phase 1で追加）
  needsRebase?: boolean; // base branchが進んでいてrebaseが必要か
  worktreePath?: string; // worktreeのフルパス（APIから返される）
}

// Todo型（Claude TodoWrite / TaskCreate / TaskUpdate hook由来）
// 'deleted' はデータ層で保持し、表示層（progress bar等）で除外する
export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
}

// Tab型（タブとメッセージ履歴を分離）
export interface Tab {
  tab_id: string; // UUID（タブ作成時に生成）
  order: number; // タブ表示用の連番
  status: 'idle' | 'running' | 'waiting' | 'success' | 'error';
  // タブの起動モード（terminal: claude自動起動なし / ollama: ローカルLLM(Ollama)で claude を起動）
  mode: 'terminal' | 'claude' | 'ollama';
  /** success/error で完了したがタスク詳細でまだ確認していない（未読）か */
  unread: boolean;
  todos?: Todo[];
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

// Repository型
export interface Repository {
  id: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  /** トップページでの列の表示順（昇順） */
  order: number;
  createdAt: string;
}

// EnvironmentVariable型
export interface EnvironmentVariable {
  key: string;
  value: string;
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
  enabled: boolean; // 有効/無効フラグ（デフォルトtrue）
}

// 実験的機能: Ollama（ローカルLLM）で Claude Code を起動するための設定（global のみ）
export interface OllamaSettings {
  enabled: boolean;
  /** Ollama の Anthropic 互換 API のベースURL（例: http://localhost:11434） */
  baseUrl: string;
  /** Ollama のモデル名（例: qwen3.8:27b）。空文字は未設定 */
  model: string;
  /** Ollama 側のコンテキスト長。Claude Code の auto-compact 判定に使う */
  contextTokens: number;
  /** Ollama タブにのみ注入する追加の環境変数 */
  extraEnv: Record<string, string>;
}

// API Request/Response型
export interface ApiResponse<T> {
  data: T;
  error?: string;
}
