# Environment Variables API

環境変数の管理に関するAPI仕様です。3つのスコープ（global、owner、repository）で管理されます。

---

## 設計

- **REST API**: 環境変数の取得 + 変更操作（fallback用）
- **WebSocket (Socket.IO)**: 環境変数の設定・削除（優先）
- **共通Controller層**: WebSocketとREST APIの両方から呼び出される共通ロジック

**重要**: すべての変更操作（POST/DELETE）は、WebSocketとREST APIの両方で実装必須です。これにより、WebSocket接続不可時でも、環境変数の設定・削除が可能になります。

---

## スコープ

環境変数は3つのスコープで管理されます：

1. **global**: すべてのリポジトリで共通
2. **owner**: 特定owner配下の全リポジトリで共通
3. **repository**: 特定リポジトリのみ

**優先順位** (高 → 低):

```
repository > owner > global
```

---

## REST API

### GET /api/env

グローバル環境変数を取得します。

#### レスポンス

```typescript
{
  "data": {
    "env": Record<string, string>
  }
}
```

#### 例

```bash
GET /api/env
```

```json
{
  "data": {
    "env": {
      "ANTHROPIC_API_KEY": "sk-xxx",
      "DEFAULT_MODEL": "claude-sonnet-4-5-20250929"
    }
  }
}
```

---

### GET /api/owners/[owner]/env

特定ownerの環境変数を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明           |
| ---------- | ------ | -------------- |
| owner      | string | GitHub owner名 |

#### レスポンス

```typescript
{
  "data": {
    "env": Record<string, string>
  }
}
```

#### 例

```bash
GET /api/owners/minimalcorp/env
```

```json
{
  "data": {
    "env": {
      "GITHUB_TOKEN": "ghp_xxx",
      "NPM_TOKEN": "npm_xxx"
    }
  }
}
```

---

### GET /api/owners/[owner]/repositories/[repo]/env

特定リポジトリの環境変数を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| owner      | string | GitHub owner名      |
| repo       | string | GitHub repository名 |

#### レスポンス

```typescript
{
  "data": {
    "env": Record<string, string>
  }
}
```

#### 例

```bash
GET /api/owners/minimalcorp/repositories/tsunagi/env
```

```json
{
  "data": {
    "env": {
      "DATABASE_URL": "postgresql://localhost/tsunagi",
      "PORT": "3000"
    }
  }
}
```

---

### POST /api/env

**Fallback用**: グローバル環境変数を設定します（WebSocket接続不可時）。

#### リクエストボディ

```typescript
{
  "key": string,
  "value": string
}
```

#### レスポンス

```typescript
{
  "data": {
    "key": string,
    "value": string,
    "created": boolean  // true: 新規作成, false: 更新
  }
}
```

**処理**: WebSocketの `env:set` と同じController層を呼び出します。

---

### POST /api/owners/[owner]/env

**Fallback用**: Owner環境変数を設定します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明           |
| ---------- | ------ | -------------- |
| owner      | string | GitHub owner名 |

#### リクエストボディ

```typescript
{
  "key": string,
  "value": string
}
```

#### レスポンス

```typescript
{
  "data": {
    "owner": string,
    "key": string,
    "value": string,
    "created": boolean
  }
}
```

**処理**: WebSocketの `env:set` と同じController層を呼び出します。

---

### POST /api/owners/[owner]/repositories/[repo]/env

**Fallback用**: Repository環境変数を設定します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| owner      | string | GitHub owner名      |
| repo       | string | GitHub repository名 |

#### リクエストボディ

```typescript
{
  "key": string,
  "value": string
}
```

#### レスポンス

```typescript
{
  "data": {
    "owner": string,
    "repo": string,
    "key": string,
    "value": string,
    "created": boolean
  }
}
```

**処理**: WebSocketの `env:set` と同じController層を呼び出します。

---

### DELETE /api/env/[key]

**Fallback用**: グローバル環境変数を削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明         |
| ---------- | ------ | ------------ |
| key        | string | 環境変数キー |

#### レスポンス

```typescript
{
  "data": {
    "key": string
  }
}
```

**処理**: WebSocketの `env:delete` と同じController層を呼び出します。

---

### DELETE /api/owners/[owner]/env/[key]

**Fallback用**: Owner環境変数を削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明           |
| ---------- | ------ | -------------- |
| owner      | string | GitHub owner名 |
| key        | string | 環境変数キー   |

#### レスポンス

```typescript
{
  "data": {
    "owner": string,
    "key": string
  }
}
```

**処理**: WebSocketの `env:delete` と同じController層を呼び出します。

---

### DELETE /api/owners/[owner]/repositories/[repo]/env/[key]

**Fallback用**: Repository環境変数を削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| owner      | string | GitHub owner名      |
| repo       | string | GitHub repository名 |
| key        | string | 環境変数キー        |

#### レスポンス

```typescript
{
  "data": {
    "owner": string,
    "repo": string,
    "key": string
  }
}
```

**処理**: WebSocketの `env:delete` と同じController層を呼び出します。

---

## WebSocket Events

### クライアント → サーバー

#### env:set

環境変数を設定します（upsert: なければ作成、あれば更新）。

**グローバルスコープ**:

```typescript
{
  "type": "env:set",
  "data": {
    "scope": "global",
    "key": string,
    "value": string
  }
}
```

**Ownerスコープ**:

```typescript
{
  "type": "env:set",
  "data": {
    "scope": "owner",
    "owner": string,
    "key": string,
    "value": string
  }
}
```

**Repositoryスコープ**:

```typescript
{
  "type": "env:set",
  "data": {
    "scope": "repository",
    "owner": string,
    "repo": string,
    "key": string,
    "value": string
  }
}
```

#### env:delete

環境変数を削除します。

**グローバルスコープ**:

```typescript
{
  "type": "env:delete",
  "data": {
    "scope": "global",
    "key": string
  }
}
```

**Ownerスコープ**:

```typescript
{
  "type": "env:delete",
  "data": {
    "scope": "owner",
    "owner": string,
    "key": string
  }
}
```

**Repositoryスコープ**:

```typescript
{
  "type": "env:delete",
  "data": {
    "scope": "repository",
    "owner": string,
    "repo": string,
    "key": string
  }
}
```

---

### サーバー → クライアント

#### env:updated

環境変数設定が完了しました（`env:set` への応答）。

**グローバルスコープ**:

```typescript
{
  "type": "env:updated",
  "timestamp": "2024-01-20T11:00:00.000Z",
  "data": {
    "scope": "global",
    "key": string,
    "value": string,
    "created": boolean  // true: 新規作成, false: 更新
  }
}
```

**Ownerスコープ**:

```typescript
{
  "type": "env:updated",
  "timestamp": "2024-01-20T11:01:00.000Z",
  "data": {
    "scope": "owner",
    "owner": string,
    "key": string,
    "value": string,
    "created": boolean
  }
}
```

**Repositoryスコープ**:

```typescript
{
  "type": "env:updated",
  "timestamp": "2024-01-20T11:02:00.000Z",
  "data": {
    "scope": "repository",
    "owner": string,
    "repo": string,
    "key": string,
    "value": string,
    "created": boolean
  }
}
```

#### env:deleted

環境変数削除が完了しました（`env:delete` への応答）。

```typescript
{
  "type": "env:deleted",
  "timestamp": "2024-01-20T11:10:00.000Z",
  "data": {
    "scope": "global" | "owner" | "repository",
    "owner"?: string,      // scope: owner, repository
    "repo"?: string,       // scope: repository
    "key": string
  }
}
```

---

## データ保存

### ファイルパス

```
~/.tsunagi/env/
├── global.json                        # グローバル環境変数
├── owners/
│   ├── minimalcorp.json              # minimalcorpの環境変数
│   └── another-org.json
└── repos/
    ├── minimalcorp_tsunagi.json      # minimalcorp/tsunagiの環境変数
    └── minimalcorp_other.json
```

### ファイル形式

```json
{
  "ANTHROPIC_API_KEY": "sk-xxx",
  "DEFAULT_MODEL": "claude-sonnet-4-5-20250929"
}
```

---

## 環境変数の解決

Claude実行時に環境変数を解決する優先順位:

```typescript
function resolveEnv(owner: string, repo: string): Record<string, string> {
  const global = loadGlobalEnv();
  const ownerEnv = loadOwnerEnv(owner);
  const repoEnv = loadRepoEnv(owner, repo);

  // repository > owner > global の順で上書き
  return {
    ...global,
    ...ownerEnv,
    ...repoEnv,
  };
}
```

**例**:

```
global: { API_KEY: "global_key", MODEL: "sonnet" }
owner:  { API_KEY: "owner_key", TOKEN: "xxx" }
repo:   { MODEL: "opus" }

結果:   { API_KEY: "owner_key", MODEL: "opus", TOKEN: "xxx" }
```

---

## UI実装例

```tsx
function EnvironmentVariablesManager({ scope, owner, repo }: Props) {
  const [env, setEnv] = useState<Record<string, string>>({});
  const ws = useWebSocket();

  useEffect(() => {
    // 初回ロード
    const endpoint =
      scope === 'global'
        ? '/api/env'
        : scope === 'owner'
          ? `/api/owners/${owner}/env`
          : `/api/owners/${owner}/repositories/${repo}/env`;

    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => setEnv(data.data.env));

    // WebSocketイベントハンドラ
    ws.on('env:updated', (event) => {
      // スコープが一致する場合のみ更新
      if (
        event.data.scope === scope &&
        (scope === 'global' || event.data.owner === owner) &&
        (scope !== 'repository' || event.data.repo === repo)
      ) {
        setEnv((prev) => ({
          ...prev,
          [event.data.key]: event.data.value,
        }));
      }
    });

    ws.on('env:deleted', (event) => {
      if (
        event.data.scope === scope &&
        (scope === 'global' || event.data.owner === owner) &&
        (scope !== 'repository' || event.data.repo === repo)
      ) {
        setEnv((prev) => {
          const updated = { ...prev };
          delete updated[event.data.key];
          return updated;
        });
      }
    });
  }, [ws, scope, owner, repo]);

  const setVariable = (key: string, value: string) => {
    ws.send({
      type: 'env:set',
      data: {
        scope,
        ...(scope !== 'global' && { owner }),
        ...(scope === 'repository' && { repo }),
        key,
        value,
      },
    });
  };

  const deleteVariable = (key: string) => {
    ws.send({
      type: 'env:delete',
      data: {
        scope,
        ...(scope !== 'global' && { owner }),
        ...(scope === 'repository' && { repo }),
        key,
      },
    });
  };

  return (
    <div>
      <h3>{scope} Environment Variables</h3>
      {Object.entries(env).map(([key, value]) => (
        <EnvVariableRow
          key={key}
          envKey={key}
          value={value}
          onUpdate={(newValue) => setVariable(key, newValue)}
          onDelete={() => deleteVariable(key)}
        />
      ))}
      <EnvVariableForm onSubmit={setVariable} />
    </div>
  );
}
```
