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
  logs: LogEntry[];
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  agentSessionId?: string; // Claude Agent SDKのセッションID (最初のプロンプト送信時に設定)
}

// LogEntry型
export interface LogEntry {
  timestamp: string;
  type: 'tool_use' | 'tool_result' | 'file_operation' | 'thinking' | 'message' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
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
