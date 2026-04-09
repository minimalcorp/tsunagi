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
  order?: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  tabs: Tab[]; // タブ管理（Phase 1で追加）
  needsRebase?: boolean; // base branchが進んでいてrebaseが必要か
  worktreePath?: string; // worktreeのフルパス（APIから返される）
}

// Todo型（Claude TodoWrite hook由来）
export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// Tab型（タブとメッセージ履歴を分離）
export interface Tab {
  tab_id: string; // UUID（タブ作成時に生成）
  order: number; // タブ表示用の連番
  status: 'idle' | 'running' | 'waiting' | 'success' | 'error';
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
