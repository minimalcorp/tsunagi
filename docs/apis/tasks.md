# Tasks API

タスク管理に関するAPI仕様です。

---

## 設計

- **REST API**: タスクデータの取得 + 変更操作（fallback用）
- **WebSocket (Socket.IO)**: タスクの作成・更新・削除（優先）
- **共通Controller層**: WebSocketとREST APIの両方から呼び出される共通ロジック

**重要**: すべての変更操作（POST/PUT/DELETE）は、WebSocketとREST APIの両方で実装必須です。これにより、WebSocket接続不可時やSocket.IOのtransport fallbackが失敗した場合でも、アプリケーションが正常に動作し続けることを保証します。

---

## REST API

### GET /api/tasks

全タスク一覧を取得します（全リポジトリ横断）。

**デフォルト動作**: 削除されていないタスク（`deleted: false`）のみ返します。

#### クエリパラメータ

| パラメータ     | 型                                                                        | 必須 | 説明                                        |
| -------------- | ------------------------------------------------------------------------- | ---- | ------------------------------------------- |
| owner          | string                                                                    | ✗    | ownerでフィルタリング                       |
| repo           | string                                                                    | ✗    | repoでフィルタリング                        |
| status         | 'backlog' \| 'planning' \| 'tasking' \| 'coding' \| 'reviewing' \| 'done' | ✗    | ステータスでフィルタリング                  |
| search         | string                                                                    | ✗    | タイトル・説明文で検索                      |
| includeDeleted | boolean                                                                   | ✗    | 削除済みタスクも含める（デフォルト: false） |

#### レスポンス

```typescript
{
  "data": {
    "tasks": Task[]
  }
}
```

#### 例

**通常のタスク一覧取得**:

```bash
GET /api/tasks?owner=minimalcorp&status=coding
```

**削除済みタスクも含めて取得**:

```bash
GET /api/tasks?includeDeleted=true
```

```json
{
  "data": {
    "tasks": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "ログイン機能の実装",
        "status": "coding",
        "owner": "minimalcorp",
        "repo": "tsunagi",
        "branch": "feat/auth",
        "deleted": false,
        ...
      }
    ]
  }
}
```

---

### GET /api/tasks/[id]

特定のタスクを取得します。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "task": Task
  }
}
```

#### 例

```bash
GET /api/tasks/550e8400-e29b-41d4-a716-446655440000
```

```json
{
  "data": {
    "task": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "ログイン機能の実装",
      "description": "JWT認証を使用したログイン機能を実装する",
      "status": "coding",
      "owner": "minimalcorp",
      "repo": "tsunagi",
      "branch": "feat/auth",
      "effort": 4.0,
      "order": 0,
      "deleted": false,
      "createdAt": "2024-01-20T10:00:00.000Z",
      "updatedAt": "2024-01-20T10:00:00.000Z"
    }
  }
}
```

---

### POST /api/tasks

**Fallback用**: タスクを作成します（WebSocket接続不可時）。

#### リクエストボディ

```typescript
{
  "owner": string,           // 必須、GitHub owner名
  "repo": string,            // 必須、GitHub repository名
  "title": string,           // 必須、1-200文字
  "description"?: string,    // オプション、0-5000文字
  "branch": string,          // 必須、ブランチ名
  "plan"?: string,           // オプション、実行計画
  "prompt"?: string          // オプション、Claudeへの初期指示
}
```

#### レスポンス

```typescript
{
  "data": {
    "task": Task,
    "worktree": {
      "path": string,        // 作成されたworktreeのパス
      "branch": string       // ブランチ名
    }
  }
}
```

**処理**: WebSocketの `task:create` と同じController層を呼び出します。

---

### PUT /api/tasks/[id]

**Fallback用**: タスクを更新します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### リクエストボディ

```typescript
{
  "title"?: string,
  "description"?: string,
  "status"?: 'todo' | 'in-progress' | 'done',
  "plan"?: string,
  "effort"?: number,         // 工数（時間）、0.5刻み
  "order"?: number           // 実行順序（0, 1, 2, ...）
}
```

#### レスポンス

```typescript
{
  "data": {
    "task": Task  // 更新後の最新状態
  }
}
```

**処理**: WebSocketの `task:update` と同じController層を呼び出します。

---

### DELETE /api/tasks/[id]

**Fallback用**: タスクを論理削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "task": Task  // 削除されたタスク（deleted: true, deletedAt が設定済み）
  }
}
```

**処理**: WebSocketの `task:delete` と同じController層を呼び出します。

**論理削除の動作**:

- タスクデータ: `deleted: true`, `deletedAt: "2024-01-20T..."` を設定（論理削除）
- Worktree: 物理削除（`git worktree remove --force`）
- ローカルブランチ: 物理削除（`git branch -D`）
- リモートブランチ: 物理削除（`git push origin --delete`）

**注意**:

- 未コミットの変更がある場合でも強制削除されます
- 削除されたタスクは `GET /api/tasks?includeDeleted=true` で取得可能です
- UI（Kanban board）には表示されません

---

## WebSocket Events

### クライアント → サーバー

#### task:create

新規タスクを作成します。

**自動処理**: タスク作成時に、指定されたbranchのworktreeが自動的に作成されます。

```typescript
{
  "type": "task:create",
  "data": {
    "owner": string,           // 必須、GitHub owner名
    "repo": string,            // 必須、GitHub repository名
    "title": string,           // 必須、1-200文字
    "description"?: string,    // オプション、0-5000文字
    "branch": string,          // 必須、ブランチ名
    "plan"?: string,           // オプション、実行計画
    "prompt"?: string          // オプション、Claudeへの初期指示
  }
}
```

**処理フロー**:

1. タスクを `tasks.json` に保存
2. bare repositoryの存在を確認（なければエラー）
3. 指定されたbranchのworktreeを作成
4. worktreeパスをタスクと紐付け
5. `task:created` イベントを全クライアントに送信

#### task:update

既存タスクを更新します。

```typescript
{
  "type": "task:update",
  "data": {
    "id": string,              // 必須、タスクID
    "title"?: string,
    "description"?: string,
    "status"?: 'todo' | 'in-progress' | 'done',
    "plan"?: string,
    "effort"?: number,         // 工数（時間）、0.5刻み
    "order"?: number           // 実行順序（0, 1, 2, ...）
  }
}
```

**注意**: `owner`, `repo`, `branch` は変更できません（不変）。

#### task:delete

タスクを論理削除します。

**論理削除の動作**: タスクデータは論理削除（`deleted: true`）されますが、worktree・ブランチは物理削除されます。

```typescript
{
  "type": "task:delete",
  "data": {
    "id": string  // 必須、タスクID
  }
}
```

**処理フロー**:

1. タスクを論理削除（`deleted: true`, `deletedAt` を設定）
2. worktreeを削除（`git worktree remove --force`）
3. ローカルブランチを削除（`git branch -D`）
4. リモートブランチを削除（`git push origin --delete`）
5. `task:deleted` イベントを全クライアントに送信

**注意**:

- 削除されたタスクは `GET /api/tasks?includeDeleted=true` で取得可能
- UI（Kanban board）には表示されない

---

### サーバー → クライアント

#### task:created

タスク作成が完了しました。

```typescript
{
  "type": "task:created",
  "timestamp": "2024-01-20T09:00:00.000Z",
  "data": {
    "task": Task,
    "worktree": {
      "path": string,        // 作成されたworktreeのパス
      "branch": string       // ブランチ名
    }
  }
}
```

#### task:updated

タスク更新が完了しました。

```typescript
{
  "type": "task:updated",
  "timestamp": "2024-01-20T09:05:00.000Z",
  "data": {
    "task": Task  // 更新後の最新状態
  }
}
```

#### task:deleted

タスク論理削除が完了しました。

```typescript
{
  "type": "task:deleted",
  "timestamp": "2024-01-20T09:10:00.000Z",
  "data": {
    "task": Task  // 削除されたタスク（deleted: true, deletedAt が設定済み）
  }
}
```

**UI対応**: Kanban boardから該当タスクを除外表示します。

---

## エラー

### バリデーションエラー（task:create, task:update）

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T09:00:00.000Z",
  "data": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "fields": [
      {
        "key": "title",
        "message": "Title is required"
      }
    ],
    "originalEvent": {
      "type": "task:create",
      "data": { ... }
    }
  }
}
```

### リポジトリが見つからない（task:create）

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T09:00:00.000Z",
  "data": {
    "message": "Repository not found. Please clone the repository first.",
    "code": "REPOSITORY_NOT_FOUND",
    "originalEvent": {
      "type": "task:create",
      "data": { ... }
    }
  }
}
```

### 同じブランチのタスクが既に存在（task:create）

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T09:00:00.000Z",
  "data": {
    "message": "Task with branch 'feat/auth' already exists",
    "code": "BRANCH_CONFLICT",
    "originalEvent": {
      "type": "task:create",
      "data": { ... }
    }
  }
}
```

---

## UI実装例

```tsx
import { useWebSocket } from '@/hooks/useWebSocket';

function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const ws = useWebSocket();

  useEffect(() => {
    // 初回ロード（デフォルトで deleted=false のタスクのみ取得）
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => setTasks(data.data.tasks));

    // WebSocketイベントハンドラ
    ws.on('task:created', (event) => {
      setTasks((prev) => [...prev, event.data.task]);
    });

    ws.on('task:updated', (event) => {
      setTasks((prev) => prev.map((t) => (t.id === event.data.task.id ? event.data.task : t)));
    });

    ws.on('task:deleted', (event) => {
      // 論理削除されたタスクをUIから除外
      setTasks((prev) => prev.filter((t) => t.id !== event.data.task.id));
    });
  }, [ws]);

  // タスク作成
  const createTask = (data: TaskCreateData) => {
    ws.send({
      type: 'task:create',
      data,
    });
  };

  // タスク更新
  const updateTask = (id: string, updates: Partial<Task>) => {
    ws.send({
      type: 'task:update',
      data: { id, ...updates },
    });
  };

  // タスク削除
  const deleteTask = (id: string) => {
    ws.send({
      type: 'task:delete',
      data: { id },
    });
  };

  return (
    <div>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onUpdate={(updates) => updateTask(task.id, updates)}
          onDelete={() => deleteTask(task.id)}
        />
      ))}
    </div>
  );
}
```
