# Repositories & Owners API

リポジトリとOwnerの管理に関するAPI仕様です。

---

## 設計

- **REST API**: データ取得 + 変更操作（fallback用）
- **WebSocket (Socket.IO)**: リポジトリのクローン・更新・削除（優先）
- **共通Controller層**: WebSocketとREST APIの両方から呼び出される共通ロジック

**重要**: すべての変更操作（POST/PUT/DELETE）は、WebSocketとREST APIの両方で実装必須です。これにより、WebSocket接続不可時でも、リポジトリの登録・削除等の基本操作が可能になります。

---

## REST API

### GET /api/owners

すべてのOwnerを取得します。

#### レスポンス

```typescript
{
  "data": {
    "owners": Owner[]
  }
}
```

**Owner型**:

```typescript
interface Owner {
  name: string; // owner名（例: "minimalcorp"）
  repositories: Repository[]; // 所有するリポジトリ一覧
}
```

#### 例

```bash
GET /api/owners
```

```json
{
  "data": {
    "owners": [
      {
        "name": "minimalcorp",
        "repositories": [
          {
            "id": "770e8400-...",
            "owner": "minimalcorp",
            "repo": "tsunagi",
            "cloneUrl": "https://github.com/minimalcorp/tsunagi.git",
            "bareRepoPath": "/Users/username/.tsunagi/workspaces/minimalcorp/tsunagi/.bare",
            "createdAt": "2024-01-15T09:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

---

### GET /api/owners/[owner]/repositories

特定ownerのリポジトリ一覧を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明           |
| ---------- | ------ | -------------- |
| owner      | string | GitHub owner名 |

#### レスポンス

```typescript
{
  "data": {
    "repositories": Repository[]
  }
}
```

#### 例

```bash
GET /api/owners/minimalcorp/repositories
```

---

### GET /api/owners/[owner]/repositories/[repo]

特定リポジトリの詳細を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| owner      | string | GitHub owner名      |
| repo       | string | GitHub repository名 |

#### レスポンス

```typescript
{
  "data": {
    "repository": Repository
  }
}
```

#### 例

```bash
GET /api/owners/minimalcorp/repositories/tsunagi
```

```json
{
  "data": {
    "repository": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "owner": "minimalcorp",
      "repo": "tsunagi",
      "cloneUrl": "https://github.com/minimalcorp/tsunagi.git",
      "bareRepoPath": "/Users/username/.tsunagi/workspaces/minimalcorp/tsunagi/.bare",
      "createdAt": "2024-01-15T09:00:00.000Z"
    }
  }
}
```

---

### POST /api/clone

**Fallback用**: Gitリポジトリをクローンして登録します（WebSocket接続不可時）。

#### リクエストボディ

```typescript
{
  "gitUrl": string,          // 必須、GitHub repository URL
  "authToken"?: string       // オプション、認証トークン
}
```

**Git URL形式**:

- HTTPS: `https://github.com/minimalcorp/tsunagi.git`
- SSH: `git@github.com:minimalcorp/tsunagi.git`

#### レスポンス

```typescript
{
  "data": {
    "repository": Repository
  }
}
```

**処理**: WebSocketの `clone:start` と同じController層を呼び出します。Git URLからowner/repoを自動判定し、bare cloneを実行します。

---

### PUT /api/owners/[owner]/repositories/[repo]

**Fallback用**: リポジトリ設定を更新します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| owner      | string | GitHub owner名      |
| repo       | string | GitHub repository名 |

#### リクエストボディ

```typescript
{
  "cloneUrl"?: string,       // オプション、clone URL更新
  "authToken"?: string       // オプション、認証トークン更新
}
```

#### レスポンス

```typescript
{
  "data": {
    "repository": Repository  // 更新後の最新状態
  }
}
```

**処理**: WebSocketの `repository:update` と同じController層を呼び出します。

---

### DELETE /api/owners/[owner]/repositories/[repo]

**Fallback用**: リポジトリを削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| owner      | string | GitHub owner名      |
| repo       | string | GitHub repository名 |

#### レスポンス

```typescript
{
  "data": {
    "owner": string,
    "repo": string
  }
}
```

**処理**: WebSocketの `repository:delete` と同じController層を呼び出します。関連するすべてのタスク、worktree、ブランチも自動的に削除されます。

---

### DELETE /api/owners/[owner]

**Fallback用**: Owner（とその全リポジトリ）を削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明           |
| ---------- | ------ | -------------- |
| owner      | string | GitHub owner名 |

#### レスポンス

```typescript
{
  "data": {
    "owner": string
  }
}
```

**処理**: WebSocketの `owner:delete` と同じController層を呼び出します。そのOwnerの全リポジトリ、関連する全タスク、worktree、ブランチも自動的に削除されます。

---

## WebSocket Events

### クライアント → サーバー

#### clone:start

Gitリポジトリをクローンして登録します。

**自動処理**: Git URLからowner/repoを自動判定し、bare cloneを実行します。

```typescript
{
  "type": "clone:start",
  "data": {
    "gitUrl": string,          // 必須、GitHub repository URL
    "authToken"?: string       // オプション、認証トークン
  }
}
```

**Git URL形式**:

- HTTPS: `https://github.com/minimalcorp/tsunagi.git`
- SSH: `git@github.com:minimalcorp/tsunagi.git`

**処理フロー**:

1. **Git URLパース**: URLからowner/repoを抽出
   - HTTPS: `https://github.com/{owner}/{repo}.git`
   - SSH: `git@github.com:{owner}/{repo}.git`
2. **Bare repositoryパス決定**: `~/.tsunagi/workspaces/{owner}/{repo}/.bare`
3. **Bare clone実行**: `git clone --bare {gitUrl} {bareRepoPath}`
4. **Repository登録**: `repos.json` にowner/repo/cloneUrl等を保存
5. `repository:created` イベントを全クライアントに送信

#### repository:update

リポジトリ設定を更新します。

```typescript
{
  "type": "repository:update",
  "data": {
    "owner": string,           // 必須
    "repo": string,            // 必須
    "cloneUrl"?: string,       // オプション、clone URL更新
    "authToken"?: string       // オプション、認証トークン更新
  }
}
```

#### repository:delete

リポジトリを削除します。

**自動処理**: リポジトリ削除時に、関連するすべてのタスク、worktree、ブランチも自動的に削除されます。

```typescript
{
  "type": "repository:delete",
  "data": {
    "owner": string,  // 必須
    "repo": string    // 必須
  }
}
```

**処理フロー**:

1. このリポジトリに紐づく全タスクを削除（各タスクのworktree/branchも削除）
2. bare repositoryディレクトリを削除
3. `repos.json` からリポジトリ情報を削除
4. `repository:deleted` イベントを全クライアントに送信

#### owner:delete

Owner（とその全リポジトリ）を削除します。

**自動処理**: Owner削除時に、そのOwnerの全リポジトリ、関連する全タスク、worktree、ブランチも自動的に削除されます。

```typescript
{
  "type": "owner:delete",
  "data": {
    "owner": string  // 必須
  }
}
```

**処理フロー**:

1. このOwnerの全リポジトリを取得
2. 各リポジトリを削除（`repository:delete` と同じ処理）
3. Ownerディレクトリを削除（`~/.tsunagi/workspaces/{owner}`）
4. `owner:deleted` イベントを全クライアントに送信

---

### サーバー → クライアント

#### repository:created

リポジトリクローンが完了しました（`clone:start` への応答）。

```typescript
{
  "type": "repository:created",
  "timestamp": "2024-01-20T08:00:00.000Z",
  "data": {
    "repository": Repository
  }
}
```

#### repository:updated

リポジトリ更新が完了しました（`repository:update` への応答）。

```typescript
{
  "type": "repository:updated",
  "timestamp": "2024-01-20T08:05:00.000Z",
  "data": {
    "repository": Repository  // 更新後の最新状態
  }
}
```

#### repository:deleted

リポジトリ削除が完了しました（`repository:delete` への応答）。

```typescript
{
  "type": "repository:deleted",
  "timestamp": "2024-01-20T08:10:00.000Z",
  "data": {
    "owner": string,
    "repo": string
  }
}
```

#### owner:deleted

Owner削除が完了しました（`owner:delete` への応答）。

```typescript
{
  "type": "owner:deleted",
  "timestamp": "2024-01-20T07:00:00.000Z",
  "data": {
    "owner": string
  }
}
```

---

## エラー

### Git URLの形式が不正（clone:start）

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T08:00:00.000Z",
  "data": {
    "message": "Invalid Git URL format",
    "code": "INVALID_GIT_URL",
    "originalEvent": {
      "type": "clone:start",
      "data": { ... }
    }
  }
}
```

### 同じowner/repoのリポジトリが既に登録済み（clone:start）

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T08:00:00.000Z",
  "data": {
    "message": "Repository minimalcorp/tsunagi already exists",
    "code": "REPOSITORY_ALREADY_EXISTS",
    "originalEvent": {
      "type": "clone:start",
      "data": { ... }
    }
  }
}
```

### git cloneに失敗（clone:start）

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T08:00:00.000Z",
  "data": {
    "message": "Git clone failed: authentication required",
    "code": "GIT_CLONE_FAILED",
    "originalEvent": {
      "type": "clone:start",
      "data": { ... }
    }
  }
}
```

---

## UI実装例

```tsx
function RepositoryManager() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const ws = useWebSocket();

  useEffect(() => {
    // 初回ロード
    fetch('/api/owners')
      .then((r) => r.json())
      .then((data) => setOwners(data.data.owners));

    // WebSocketイベントハンドラ
    ws.on('repository:created', (event) => {
      setOwners((prev) => {
        const ownerIndex = prev.findIndex((o) => o.name === event.data.repository.owner);
        if (ownerIndex >= 0) {
          const updated = [...prev];
          updated[ownerIndex].repositories.push(event.data.repository);
          return updated;
        } else {
          return [
            ...prev,
            {
              name: event.data.repository.owner,
              repositories: [event.data.repository],
            },
          ];
        }
      });
    });

    ws.on('repository:updated', (event) => {
      setOwners((prev) =>
        prev.map((owner) => ({
          ...owner,
          repositories: owner.repositories.map((repo) =>
            repo.owner === event.data.repository.owner && repo.repo === event.data.repository.repo
              ? event.data.repository
              : repo
          ),
        }))
      );
    });

    ws.on('repository:deleted', (event) => {
      setOwners((prev) =>
        prev
          .map((owner) => ({
            ...owner,
            repositories: owner.repositories.filter(
              (repo) => !(repo.owner === event.data.owner && repo.repo === event.data.repo)
            ),
          }))
          .filter((owner) => owner.repositories.length > 0)
      );
    });

    ws.on('owner:deleted', (event) => {
      setOwners((prev) => prev.filter((o) => o.name !== event.data.owner));
    });
  }, [ws]);

  const cloneRepository = (gitUrl: string, authToken?: string) => {
    ws.send({
      type: 'clone:start',
      data: { gitUrl, authToken },
    });
  };

  const deleteRepository = (owner: string, repo: string) => {
    ws.send({
      type: 'repository:delete',
      data: { owner, repo },
    });
  };

  return (
    <div>
      <RepositoryCloneForm onSubmit={cloneRepository} />
      {owners.map((owner) => (
        <OwnerSection key={owner.name} owner={owner} onDeleteRepo={deleteRepository} />
      ))}
    </div>
  );
}
```
