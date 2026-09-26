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

/** ローカルLLMで Claude Code を動かすプロバイダー（実験的機能） */
export type LocalLlmProvider = 'ollama' | 'lmstudio';

/**
 * タブの起動モード。local: ローカルLLM（Settings で選んだ使用中のモデル）で claude を起動。
 * ollama / lmstudio は旧形式（local と同じ扱い）
 */
export type TabMode = 'terminal' | 'claude' | 'local' | LocalLlmProvider;

// Tab型（タブとメッセージ履歴を分離）
export interface Tab {
  tab_id: string; // UUID（タブ作成時に生成）
  order: number; // タブ表示用の連番
  status: 'idle' | 'running' | 'waiting' | 'success' | 'error';
  // タブの起動モード（terminal: claude自動起動なし / local: ローカルLLMで claude を起動）
  mode: TabMode;
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

// ---- 実験的機能: ローカルLLM（Ollama / LM Studio）で Claude Code を起動する（global のみ） ----

/** 使用中のモデル（メモリに載せるのは常にこの1つ） */
export interface LocalLlmModelRef {
  provider: LocalLlmProvider;
  /** Ollama のモデル名 / LM Studio のモデルキー */
  model: string;
  /** コンテキスト長。Ollama は派生モデルに焼き込み、LM Studio は読み込み時に指定する */
  contextTokens: number;
}

export interface LocalLlmSettings {
  /** 使用中のモデル。未設定なら null */
  active: LocalLlmModelRef | null;
  /** 最後のリクエストからこの分数でモデルを解放する。0 なら自動解放しない */
  idleUnloadMinutes: number;
  /** tsunagi の終了時にモデルを解放する */
  unloadOnExit: boolean;
  /**
   * WebSearch の方式。
   * local: 組み込み WebSearch を無効化し、tsunagi の web_search MCP（SearXNG）を使う
   * ollama: 組み込み WebSearch を Ollama が ollama.com の Web 検索 API で代行（要サインイン。使用中が Ollama のときのみ）
   */
  webSearch: 'local' | 'ollama';
  /** ローカルLLMタブにのみ注入する追加の環境変数 */
  extraEnv: Record<string, string>;
}

/** 選択肢に出すモデル（有効なプロバイダーにダウンロード済みのもの） */
export interface LocalLlmModel {
  provider: LocalLlmProvider;
  model: string;
  displayName: string;
  /** mlx / gguf */
  format: string;
  sizeBytes: number;
  /** 最大コンテキスト長（不明なら null） */
  maxContextLength: number | null;
}

export type LocalLlmState =
  /** 使用中のモデルが未設定 */
  | 'unconfigured'
  /** 使用中のモデルはメモリにない（次のリクエストで読み込む） */
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'error';

export interface LocalLlmStatus {
  state: LocalLlmState;
  active: LocalLlmModelRef | null;
  /** 応答生成中のリクエスト数（0 でないとモデルを切り替えられない） */
  inflight: number;
  /** 自動解放の予定時刻（ISO）。予定がなければ null */
  idleUnloadAt: string | null;
  error?: string;
}

// Ollama の接続設定
export interface OllamaSettings {
  enabled: boolean;
  /** Ollama の Anthropic 互換 API のベースURL（例: http://localhost:11434） */
  baseUrl: string;
}

/**
 * Ollama の ollama.com サインイン状態。
 * WebSearch を Ollama に代行させる場合、ollama.com の Web 検索 API を使うためサインインが必要。
 */
export type OllamaAccountStatus =
  | { signedIn: true; name: string }
  | { signedIn: false; signinUrl?: string };

/** Ollama サーバーの状態 */
export interface OllamaStatus {
  reachable: boolean;
  version?: string;
  /** メモリに読み込まれているモデル */
  loaded: Array<{ name: string; contextLength?: number }>;
  error?: string;
}

// LM Studio の接続設定
export interface LmStudioSettings {
  enabled: boolean;
  /** LM Studio サーバーのベースURL（例: http://localhost:1234） */
  baseUrl: string;
  /** 「Require Authentication」有効時の API トークン。空なら認証なし */
  apiToken: string;
  /** lms CLI のパス。空なら ~/.lmstudio/bin/lms → PATH の順で探す */
  lmsPath: string;
}

/** LM Studio の状態 */
export interface LmStudioStatus {
  /** lms CLI のパス（見つからなければ null） */
  lmsPath: string | null;
  /** ベースURLの API サーバーが応答するか */
  serverRunning: boolean;
  /** 読み込み済みのモデル */
  loaded: Array<{ key: string; instanceId: string; contextLength: number }>;
  error?: string;
}

/** lms load --estimate-only の結果 */
export interface LmStudioEstimate {
  /** 例: "26.64 GiB" */
  totalMemory: string | null;
  /** 例: "This model may be loaded based on your resource guardrails settings." */
  verdict: string | null;
}

// ローカル検索（SearXNG）。Ollama / LM Studio タブの web_search MCP から使う
export interface SearxngSettings {
  port: number;
  /** searxng-run のパス。空なら PATH から探す */
  binPath: string;
  /** SearXNG の設定ファイル。空なら tsunagi が生成したものを使う */
  settingsPath: string;
}

export type SearxngState =
  | 'stopped'
  | 'starting'
  /** tsunagi が起動した */
  | 'running'
  /** tsunagi 外で起動済み（tsunagi は止めない） */
  | 'external'
  | 'not-installed'
  | 'error';

export interface SearxngStatus {
  state: SearxngState;
  url: string;
  /** Ollama / LM Studio のどちらかが有効（= 自動起動の対象） */
  required: boolean;
  binPath: string | null;
  error?: string;
}

// API Request/Response型
export interface ApiResponse<T> {
  data: T;
  error?: string;
}
