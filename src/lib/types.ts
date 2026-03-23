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
  baseBranchCommit?: string; // worktree作成時のbaseBranchのコミットハッシュ
  repoId: string; // Repository IDへの参照
  worktreeStatus: 'pending' | 'created' | 'error';

  // 計画ドキュメント（planning時に作成）
  requirement?: string; // Markdown形式、要求仕様
  design?: string; // Markdown形式、IF定義・設計
  procedure?: string; // Markdown形式、実装手順チェックリスト

  // Pull Request情報
  pullRequestUrl?: string;

  effort?: number;
  order?: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  tabs: Tab[]; // タブ管理（Phase 1で追加）
  needsRebase?: boolean; // base branchが進んでいてrebaseが必要か
  worktreePath?: string; // worktreeのフルパス（APIから返される）
}

// Tab型（タブとメッセージ履歴を分離）
export interface Tab {
  tab_id: string; // UUID（タブ作成時に生成）
  order: number; // タブ表示用の連番
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  session_id?: string; // Claude Agent SDKのセッションID（初回プロンプト後に設定）
  promptCount?: number; // 送信したプロンプト数
}

// UserPrompt型（ユーザーが送信したプロンプト）
export interface UserPrompt {
  created_at: string; // ISO8601形式
  prompt: string; // ユーザーのプロンプトテキスト
  _sequence?: number; // タブ内の連番（オプショナル、既存データ互換性のため）
}

// SessionData型（sessions.jsonの値型）
export interface SessionData {
  sdkMessages: unknown[];
  prompts: UserPrompt[];
  nextSequence?: number; // タブごとの連番カウンター（オプショナル、既存データ互換性のため）
}

// ============================================
// Merged Message型（getMergedMessagesの返り値）
// ============================================

// UserPromptから変換されたメッセージ
export interface SimplifiedUserMessage {
  type: 'prompt';
  created_at: string;
  message: { content: string };
}

// SequencedMessage型（シーケンス番号付きメッセージ）
export interface SequencedMessage extends Record<string, unknown> {
  _sequence: number; // タブ内の連番
  created_at?: string;
  type?: string;
}

// getMergedMessagesが返すメッセージ型
// - SimplifiedUserMessage: promptsから変換されたメッセージ
// - unknown: sdkMessagesからのSDKメッセージ（SDKMessage型だが、型定義をimportせずにunknownとする）
export type MergedMessage = SequencedMessage;

// ============================================
// UIMessage型（新しいデータモデル）
// ============================================

// UIメッセージのタイプ
export type UIMessageType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_execution_group'
  | 'error'
  | 'system_event';

// UIメッセージ本体
export interface UIMessage {
  id: string;
  timestamp: string;
  type: UIMessageType;
  content: UIMessageContent;
  metadata: UIMessageMetadata;
}

// UIメッセージのコンテンツ（タイプ別）
export type UIMessageContent =
  | UserMessageContent
  | AssistantMessageContent
  | ToolExecutionGroupContent
  | ErrorContent
  | SystemEventContent;

// ユーザーメッセージ
export interface UserMessageContent {
  type: 'user_message';
  text: string;
}

// アシスタントメッセージ
export interface AssistantMessageContent {
  type: 'assistant_message';
  // blocks配列で順序を保持（thinking → text → tool_use の順）
  blocks: AssistantMessageBlock[];
}

export type AssistantMessageBlock =
  | { type: 'thinking'; content: string; isRedacted?: boolean }
  | { type: 'text'; content: string }
  | { type: 'tool_use'; info: ToolExecution }
  | { type: 'tool_use_group'; executions: ToolExecution[] };

// ツール実行グループ（複数のツール実行を1ブロックに集約）
export interface ToolExecutionGroupContent {
  type: 'tool_execution_group';
  executions: ToolExecution[];
  startTime: string;
  endTime?: string;
  allCompleted: boolean;
}

// 個別のツール実行
export interface ToolExecution {
  id: string; // tool_use_id
  toolName: string;
  input?: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  startTime: string;
  endTime?: string;
}

// エラー
export interface ErrorContent {
  type: 'error';
  message: string;
  details?: string;
}

// システムイベント
export interface SystemEventContent {
  type: 'system_event';
  event: string;
  description: string;
}

// UIメッセージのメタデータ
export interface UIMessageMetadata {
  sdkMessageUuids?: string[]; // 元となったSDKメッセージのUUID
  updatedAt?: string;
  role?: 'user' | 'assistant';
  model?: string;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Repository型
export interface Repository {
  id: string;
  owner: string;
  repo: string;
  cloneUrl: string;
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

// Claude Agent SDK Settings Sources設定
export type SettingSource = 'user' | 'project' | 'local';

export interface ClaudeSettingSources {
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
  sources: SettingSource[]; // ['user', 'project', 'local']の組み合わせ
  enabled: boolean; // 有効/無効フラグ
}

// resolveSettings関数の戻り値型
export interface ResolvedSettings {
  settingSources?: SettingSource[]; // undefinedの場合はisolationモード
  env: Record<string, string>; // 環境変数（Claude Tokenを含む）
}

// API Request/Response型
export interface ApiResponse<T> {
  data: T;
  error?: string;
}
