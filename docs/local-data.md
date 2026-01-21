# ローカルデータ管理

Tsunagiのローカルデータ管理方法について説明します。MVPではファイルベース（JSON）でデータを永続化し、Git worktreeでソースコードを管理します。

---

## ディレクトリ構造

### 設定・データディレクトリ

```
~/.tsunagi/
├── tasks.json          # タスクデータ
├── repos.json          # リポジトリ設定
└── env/                # 環境変数
    ├── global.env      # グローバル環境変数
    ├── owners/         # owner単位の環境変数
    │   ├── minimalcorp.env
    │   └── otherorg.env
    └── repos/          # repo単位の環境変数
        ├── minimalcorp_tsunagi.env
        └── minimalcorp_api-server.env
```

### Worktreeルートディレクトリ

```
~/.tsunagi/workspaces/
└── {owner}/            # GitHub organization/user名
    └── {repo}/         # リポジトリ名
        ├── .git/       # bare repository
        ├── main/       # mainブランチのworktree
        ├── develop/    # developブランチのworktree
        └── feat-auth/  # feature/authブランチのworktree
```

---

## tasks.json

タスクデータを保存するJSONファイルです。

### ファイルパス

```
~/.tsunagi/state/tasks.json
```

### データ構造

```typescript
interface TasksData {
  version: string; // データフォーマットバージョン（例: "1.0"）
  tasks: Task[]; // タスクの配列
}
```

### サンプル

```json
{
  "version": "1.0",
  "tasks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "ログイン機能の実装",
      "description": "JWT認証を使用したログイン機能を実装する",
      "plan": "1. パスワードハッシュ化機能の実装\n2. JWT生成・検証機能の実装\n3. ログインエンドポイントの作成\n4. 認証ミドルウェアの実装\n5. テストコードの追加",
      "status": "coding",
      "owner": "minimalcorp",
      "repo": "tsunagi",
      "branch": "feat/auth",
      "claudeState": "idle",
      "prompt": "JWT認証を使用したログイン機能を実装してください",
      "effort": 4.0,
      "order": 0,
      "deleted": false,
      "logs": [
        {
          "timestamp": "2024-01-20T10:30:00.000Z",
          "direction": "send",
          "content": "JWT認証を使用したログイン機能を実装してください",
          "type": "info"
        }
      ],
      "createdAt": "2024-01-20T10:00:00.000Z",
      "updatedAt": "2024-01-20T10:30:00.000Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "title": "APIドキュメントの更新",
      "description": "新しいエンドポイントのドキュメントを追加",
      "status": "backlog",
      "owner": "minimalcorp",
      "repo": "api-server",
      "branch": "docs/update",
      "claudeState": "idle",
      "effort": 1.5,
      "order": 1,
      "deleted": false,
      "logs": [],
      "createdAt": "2024-01-20T11:00:00.000Z",
      "updatedAt": "2024-01-20T11:00:00.000Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "title": "旧機能の削除",
      "description": "非推奨となった旧ログイン機能を削除",
      "status": "done",
      "owner": "minimalcorp",
      "repo": "tsunagi",
      "branch": "chore/remove-old-auth",
      "claudeState": "idle",
      "effort": 2.0,
      "order": 10,
      "deleted": true,
      "deletedAt": "2024-01-21T14:00:00.000Z",
      "logs": [],
      "createdAt": "2024-01-19T09:00:00.000Z",
      "updatedAt": "2024-01-21T14:00:00.000Z"
    }
  ]
}
```

### 操作

#### 読み込み

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TASKS_FILE = path.join(os.homedir(), '.tsunagi', 'tasks.json');

async function loadTasks(includeDeleted: boolean = false): Promise<Task[]> {
  try {
    const content = await fs.readFile(TASKS_FILE, 'utf-8');
    const data: TasksData = JSON.parse(content);

    // デフォルトでは削除済みタスクを除外
    if (includeDeleted) {
      return data.tasks;
    } else {
      return data.tasks.filter((task) => !task.deleted);
    }
  } catch (error) {
    // ファイルが存在しない場合は空配列
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
```

**使用例**:

```typescript
// 通常のタスク取得（削除済みを除外）
const activeTasks = await loadTasks();

// 削除済みタスクも含めて取得
const allTasks = await loadTasks(true);

// 削除済みタスクのみ取得
const deletedTasks = (await loadTasks(true)).filter((t) => t.deleted);
```

#### 保存

```typescript
async function saveTasks(tasks: Task[]): Promise<void> {
  const data: TasksData = {
    version: '1.0',
    tasks,
  };

  // ディレクトリが存在しない場合は作成
  const dir = path.dirname(TASKS_FILE);
  await fs.mkdir(dir, { recursive: true });

  // 原子的書き込み（一時ファイル経由）
  const tempFile = `${TASKS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempFile, TASKS_FILE);
}
```

---

## 論理削除

### 設計方針

Tsunagiでは、タスクの削除は**論理削除**方式を採用しています。

**論理削除とは**:

- タスクデータは物理的に削除せず、`deleted: true` フラグを設定
- `deletedAt` フィールドに削除日時を記録
- 削除済みタスクは通常のAPI呼び出しでは返されない
- 必要に応じて `includeDeleted=true` で検索・閲覧可能

**物理削除対象**:

- Worktree（ディスク容量節約のため）
- ローカルブランチ
- リモートブランチ

### 削除処理の実装例

```typescript
async function deleteTask(id: string): Promise<Task> {
  const tasks = await loadTasks(true); // 削除済みも含めて取得
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }

  const task = tasks[index];

  // タスクを論理削除
  tasks[index] = {
    ...task,
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveTasks(tasks);

  // Worktree/ブランチを物理削除
  await removeWorktree(task.owner, task.repo, task.branch);
  await deleteLocalBranch(task.owner, task.repo, task.branch);
  await deleteRemoteBranch(task.owner, task.repo, task.branch);

  return tasks[index];
}
```

### クリーンアップ（将来実装）

古い削除済みタスクを物理削除する機能（オプション）:

```typescript
async function cleanupDeletedTasks(olderThanDays: number = 30): Promise<number> {
  const tasks = await loadTasks(true);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const tasksToKeep = tasks.filter((task) => {
    if (!task.deleted) return true; // 削除されていないタスクは保持

    const deletedAt = new Date(task.deletedAt!);
    return deletedAt > cutoffDate; // 削除から指定日数以内は保持
  });

  const removedCount = tasks.length - tasksToKeep.length;

  if (removedCount > 0) {
    await saveTasks(tasksToKeep);
  }

  return removedCount;
}
```

---

## repos.json

リポジトリ設定を保存するJSONファイルです。

### ファイルパス

```
~/.tsunagi/state/repos.json
```

### データ構造

```typescript
interface ReposData {
  version: string; // データフォーマットバージョン（例: "1.0"）
  repositories: Repository[]; // リポジトリの配列
}
```

### サンプル

```json
{
  "version": "1.0",
  "repositories": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "owner": "minimalcorp",
      "repo": "tsunagi",
      "cloneUrl": "https://github.com/minimalcorp/tsunagi.git",
      "bareRepoPath": "/Users/username/tsunagi/minimalcorp/tsunagi",
      "createdAt": "2024-01-15T09:00:00.000Z"
    },
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "owner": "minimalcorp",
      "repo": "api-server",
      "cloneUrl": "https://github.com/minimalcorp/api-server.git",
      "authToken": "ghp_xxxxxxxxxxxxxxxxxxxx",
      "bareRepoPath": "/Users/username/tsunagi/minimalcorp/api-server",
      "createdAt": "2024-01-16T10:00:00.000Z"
    }
  ]
}
```

### 操作

#### 読み込み

```typescript
const REPOS_FILE = path.join(os.homedir(), '.tsunagi', 'repos.json');

async function loadRepos(): Promise<Repository[]> {
  try {
    const content = await fs.readFile(REPOS_FILE, 'utf-8');
    const data: ReposData = JSON.parse(content);
    return data.repositories;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
```

#### 保存

```typescript
async function saveRepos(repositories: Repository[]): Promise<void> {
  const data: ReposData = {
    version: '1.0',
    repositories,
  };

  const dir = path.dirname(REPOS_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tempFile = `${REPOS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempFile, REPOS_FILE);
}
```

---

## Git Worktreeディレクトリ

### ディレクトリ構造

```
~/.tsunagi/workspaces/
└── {owner}/
    └── {repo}/
        ├── .git/           # bare repository
        │   ├── HEAD
        │   ├── config
        │   ├── objects/
        │   ├── refs/
        │   └── worktrees/  # worktree管理ディレクトリ
        │
        ├── main/           # mainブランチのworktree
        │   ├── .git        # worktreeへのリンク
        │   ├── src/
        │   └── package.json
        │
        └── feat-auth/      # feature/authブランチのworktree
            ├── .git
            ├── src/
            └── package.json
```

### Bare Repositoryの初期化

```bash
# 初回クローン
cd ~/.tsunagi/workspaces/{owner}
git clone --bare https://github.com/{owner}/{repo}.git {repo}
```

### Worktreeの作成

```bash
# bare repositoryディレクトリで実行
cd ~/.tsunagi/workspaces/{owner}/{repo}
git worktree add main main
git worktree add feat-auth feat/auth
```

### Worktreeの削除

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}
git worktree remove feat-auth
```

### Worktree一覧の取得

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}
git worktree list
```

出力例：

```
/Users/username/tsunagi/minimalcorp/tsunagi         (bare)
/Users/username/tsunagi/minimalcorp/tsunagi/main    abc1234 [main]
/Users/username/tsunagi/minimalcorp/tsunagi/feat-auth  def5678 [feat/auth]
```

---

## データ整合性

### トランザクション

JSONファイル更新時は原子的書き込みを使用：

```typescript
async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const tempFile = `${filePath}.tmp`;

  // 一時ファイルに書き込み
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');

  // 原子的にリネーム
  await fs.rename(tempFile, filePath);
}
```

### バックアップ

重要な操作前にバックアップを作成：

```typescript
async function backupFile(filePath: string): Promise<void> {
  const backupPath = `${filePath}.backup`;
  try {
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    // ファイルが存在しない場合は無視
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
```

### リカバリ

エラー発生時はバックアップから復元：

```typescript
async function recoverFromBackup(filePath: string): Promise<void> {
  const backupPath = `${filePath}.backup`;
  await fs.copyFile(backupPath, filePath);
}
```

---

## パーミッション

### ファイル権限

```typescript
async function ensureSecurePermissions(filePath: string): Promise<void> {
  // 600 (rw-------) - 所有者のみ読み書き可能
  await fs.chmod(filePath, 0o600);
}
```

特に `repos.json` は認証トークンを含むため、適切な権限設定が必要です。

---

## データマイグレーション

### バージョン管理

データフォーマットのバージョンを記録：

```json
{
  "version": "1.0",
  "tasks": [...]
}
```

### マイグレーション関数

```typescript
async function migrateTasksData(data: any): Promise<TasksData> {
  const version = data.version || '0.0';

  switch (version) {
    case '0.0':
      // v0.0 → v1.0 への移行
      return {
        version: '1.0',
        tasks: data.map((task: any) => ({
          ...task,
          claudeState: task.claudeState || 'idle',
          logs: task.logs || [],
        })),
      };

    case '1.0':
      // 最新バージョン
      return data;

    default:
      throw new Error(`Unknown data version: ${version}`);
  }
}
```

---

## キャッシュ戦略

### メモリキャッシュ

頻繁に読み込むデータはメモリにキャッシュ：

```typescript
class TaskManager {
  private cache: Task[] | null = null;
  private cacheTimestamp: number = 0;
  private CACHE_TTL = 5000; // 5秒

  async getTasks(): Promise<Task[]> {
    const now = Date.now();

    // キャッシュが有効な場合
    if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cache;
    }

    // ファイルから読み込み
    this.cache = await loadTasks();
    this.cacheTimestamp = now;

    return this.cache;
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    await saveTasks(tasks);

    // キャッシュを更新
    this.cache = tasks;
    this.cacheTimestamp = Date.now();
  }
}
```

---

## クリーンアップ

### 孤立Worktreeの削除

タスク削除時に対応するworktreeを削除するか確認：

```typescript
async function cleanupOrphanedWorktrees(): Promise<void> {
  const tasks = await loadTasks();
  const repos = await loadRepos();

  for (const repo of repos) {
    const worktrees = await getWorktrees(repo.bareRepoPath);

    for (const worktree of worktrees) {
      // このworktreeを使用しているタスクがあるか確認
      const hasTask = tasks.some(
        (task) =>
          task.owner === repo.owner && task.repo === repo.repo && task.branch === worktree.branch
      );

      if (!hasTask) {
        console.log(`Orphaned worktree found: ${worktree.path}`);
        // 削除確認（オプション）
      }
    }
  }
}
```

---

## エラーハンドリング

### ファイル操作エラー

```typescript
async function safeLoadTasks(): Promise<Task[]> {
  try {
    return await loadTasks();
  } catch (error) {
    console.error('Failed to load tasks:', error);

    // バックアップから復元を試みる
    try {
      await recoverFromBackup(TASKS_FILE);
      return await loadTasks();
    } catch (recoveryError) {
      console.error('Failed to recover from backup:', recoveryError);

      // 空配列を返す（最終フォールバック）
      return [];
    }
  }
}
```

---

## パフォーマンス最適化

### 部分更新

タスク1件の更新時は全体を読み書きする必要があるため、頻繁な更新には注意：

```typescript
async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }

  tasks[index] = {
    ...tasks[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveTasks(tasks);
}
```

### バッチ更新

複数タスクを一度に更新する場合は1回の書き込みにまとめる：

```typescript
async function batchUpdateTasks(
  updates: Array<{ id: string; updates: Partial<Task> }>
): Promise<void> {
  const tasks = await loadTasks();

  for (const { id, updates: taskUpdates } of updates) {
    const index = tasks.findIndex((t) => t.id === id);
    if (index !== -1) {
      tasks[index] = {
        ...tasks[index],
        ...taskUpdates,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  await saveTasks(tasks);
}
```

---

## 将来の拡張

### データベース移行

タスク数が1000を超える場合はSQLiteなどへの移行を検討：

```typescript
// 将来の実装例
interface DataStore {
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}

class JSONDataStore implements DataStore {
  // 現在の実装
}

class SQLiteDataStore implements DataStore {
  // 将来の実装
}
```

---

## 環境変数ファイル

環境変数は `.env` 形式のファイルで管理されます。

### ファイル構造

```
~/.tsunagi/env/
├── global.env                      # グローバル環境変数
├── owners/
│   ├── minimalcorp.env            # minimalcorp 配下のリポジトリ用
│   └── otherorg.env               # otherorg 配下のリポジトリ用
└── repos/
    ├── minimalcorp_tsunagi.env    # minimalcorp/tsunagi 用
    └── minimalcorp_api-server.env # minimalcorp/api-server 用
```

### ファイル形式

```bash
# global.env
ANTHROPIC_API_KEY=sk-ant-xxx
DEFAULT_MODEL=claude-sonnet-4.5

# owners/minimalcorp.env
GITHUB_TOKEN=ghp_xxx
NPM_TOKEN=npm_xxx

# repos/minimalcorp_tsunagi.env
DATABASE_URL=postgresql://localhost:5432/tsunagi
API_PORT=3000
```

### セキュリティ

- ファイルパーミッション: `600` (rw-------)
- Git管理対象外（`.gitignore`に追加）
- UIでは値をマスキング表示

詳細は [@docs/environment-variables.md](./environment-variables.md) を参照。
