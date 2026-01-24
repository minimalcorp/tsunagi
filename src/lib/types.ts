// Task型
export interface Task {
  id: string; // UUID
  title: string;
  description: string;
  status: 'backlog' | 'planning' | 'tasking' | 'coding' | 'reviewing' | 'done';
  owner: string;
  repo: string;
  branch: string;
  worktreeStatus: 'pending' | 'created' | 'error';
  claudeState: 'idle' | 'running';
  plan?: string;
  effort?: number;
  order?: number;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ClaudeSession型
export type ClaudeSessionStatus = 'idle' | 'running' | 'success' | 'error';

export interface ClaudeSession {
  id: string; // アプリケーション側のセッションID (UUID)
  taskId: string;
  sessionNumber: number; // タブ表示用の連番（削除されても変わらない）
  status: ClaudeSessionStatus;
  rawMessages: unknown[]; // Claude SDKから返ってきたraw messages（永続化用）
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  agentSessionId?: string; // Claude Agent SDKのセッションID (最初のプロンプト送信時に設定)
}

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
  | { type: 'tool_use'; info: ToolExecution };

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
  authToken?: string;
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

// API Request/Response型
export interface ApiResponse<T> {
  data: T;
  error?: string;
}
