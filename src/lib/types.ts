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
export interface ClaudeSession {
  id: string;
  taskId: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  logs: LogEntry[];
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

// LogEntry型
export interface LogEntry {
  timestamp: string;
  type: 'tool_use' | 'file_operation' | 'thinking' | 'message' | 'error';
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
}

// API Request/Response型
export interface ApiResponse<T> {
  data: T;
  error?: string;
}
