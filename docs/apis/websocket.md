# WebSocket API

WebSocketを使用したリアルタイム通信の詳細仕様です。

---

## 概要

WebSocketは以下の目的で使用されます：

1. **すべてのリソースの変更操作**（POST/PUT/DELETEの代替）
2. **リアルタイム更新の配信**（全クライアントへのbroadcast）
3. **Claude実行セッションの双方向通信**（Claude Code CLI互換）

---

## 接続

### エンドポイント

```
ws://localhost:3000/api/ws
```

### 接続例（JavaScript）

```typescript
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
};
```

---

## 接続確立時の処理

クライアントが接続すると、サーバーは全リソースの現在状態を送信します。

```typescript
{
  "type": "connection:established",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "tasks": Task[],
    "sessions": ClaudeSession[],  // アクティブなセッションのみ
    "repositories": Repository[],
    "owners": Owner[],
    "environments": {
      "global": Record<string, string>,
      "owners": Record<string, Record<string, string>>,   // key: owner
      "repos": Record<string, Record<string, string>>     // key: "owner/repo"
    }
  }
}
```

**UI実装**:

```typescript
ws.on('connection:established', (event) => {
  setTasks(event.data.tasks);
  setSessions(event.data.sessions);
  setRepositories(event.data.repositories);
  setEnvironments(event.data.environments);
});
```

---

## メッセージ形式

### クライアント → サーバー

```typescript
{
  "type": string,      // イベントタイプ
  "data": object       // イベントデータ
}
```

**送信例**:

```typescript
ws.send(
  JSON.stringify({
    type: 'task:create',
    data: {
      owner: 'minimalcorp',
      repo: 'tsunagi',
      title: 'ログイン機能の実装',
      branch: 'feat/auth',
    },
  })
);
```

### サーバー → クライアント

```typescript
{
  "type": string,              // イベントタイプ
  "timestamp": string,         // ISO 8601形式のタイムスタンプ
  "data": object               // イベントデータ
}
```

---

## イベント一覧

すべてのイベントは各リソースのAPIドキュメントに詳細があります：

- **Tasks**: [tasks.md](./tasks.md)
- **Sessions**: [sessions.md](./sessions.md)
- **Repositories**: [repositories.md](./repositories.md)
- **Environments**: [environments.md](./environments.md)

### クライアント → サーバー イベント一覧

| Event                      | 説明                 | 詳細            |
| -------------------------- | -------------------- | --------------- |
| task:create                | タスク作成           | tasks.md        |
| task:update                | タスク更新           | tasks.md        |
| task:delete                | タスク削除           | tasks.md        |
| session:start              | セッション開始       | sessions.md     |
| session:send_message       | 追加メッセージ送信   | sessions.md     |
| session:interrupt          | セッション中断       | sessions.md     |
| session:respond_permission | 許可プロンプト応答   | sessions.md     |
| session:resume             | セッション再開       | sessions.md     |
| session:cancel             | セッションキャンセル | sessions.md     |
| session:delete             | セッション削除       | sessions.md     |
| clone:start                | リポジトリクローン   | repositories.md |
| repository:update          | リポジトリ更新       | repositories.md |
| repository:delete          | リポジトリ削除       | repositories.md |
| owner:delete               | Owner削除            | repositories.md |
| env:set                    | 環境変数設定         | environments.md |
| env:delete                 | 環境変数削除         | environments.md |

### サーバー → クライアント イベント一覧

| Event                          | 説明                     | 詳細            |
| ------------------------------ | ------------------------ | --------------- |
| connection:established         | 接続確立                 | 本ファイル      |
| error                          | エラー発生               | 本ファイル      |
| task:created                   | タスク作成完了           | tasks.md        |
| task:updated                   | タスク更新完了           | tasks.md        |
| task:deleted                   | タスク削除完了           | tasks.md        |
| session:created                | セッション作成完了       | sessions.md     |
| session:started                | セッション開始           | sessions.md     |
| session:log                    | ログ追加                 | sessions.md     |
| session:message_received       | メッセージ受信確認       | sessions.md     |
| session:waiting_for_permission | 許可プロンプト表示       | sessions.md     |
| session:interrupted            | 中断確認                 | sessions.md     |
| session:resumed                | 再開確認                 | sessions.md     |
| session:status_changed         | ステータス変更           | sessions.md     |
| session:completed              | セッション完了           | sessions.md     |
| session:failed                 | セッション失敗           | sessions.md     |
| session:cancelled              | セッションキャンセル完了 | sessions.md     |
| session:deleted                | セッション削除完了       | sessions.md     |
| repository:created             | リポジトリクローン完了   | repositories.md |
| repository:updated             | リポジトリ更新完了       | repositories.md |
| repository:deleted             | リポジトリ削除完了       | repositories.md |
| owner:deleted                  | Owner削除完了            | repositories.md |
| env:updated                    | 環境変数設定完了         | environments.md |
| env:deleted                    | 環境変数削除完了         | environments.md |

---

## エラーハンドリング

### エラーイベント

サーバー側でエラーが発生した場合、以下の形式のイベントが送信されます：

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "message": string,           // エラーメッセージ
    "code"?: string,             // エラーコード
    "fields"?: Array<{           // バリデーションエラー時のみ
      key: string,
      message: string
    }>,
    "originalEvent"?: {          // エラーが発生した元のイベント
      "type": string,
      "data": object
    }
  }
}
```

**UI実装例**:

```typescript
ws.on('error', (event) => {
  toast.error(event.data.message);
  console.error('WebSocket error:', event.data);
});
```

---

## 再接続処理

WebSocket切断時は自動的に再接続し、最新データをREST APIでfallbackします。

```typescript
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000; // 1秒

ws.onclose = () => {
  console.log('WebSocket disconnected');

  if (reconnectAttempts < maxReconnectAttempts) {
    setTimeout(() => {
      reconnectAttempts++;
      console.log(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
      connectWebSocket();
    }, reconnectDelay * reconnectAttempts);
  } else {
    // Fallback: REST APIで最新データを取得
    refetchAllData();
  }
};

ws.onopen = () => {
  reconnectAttempts = 0;
  console.log('WebSocket reconnected');
};
```

---

## Heartbeat / Ping-Pong

接続維持のため、定期的にpingを送信します。

### クライアント → サーバー

```typescript
{
  "type": "ping"
}
```

### サーバー → クライアント

```typescript
{
  "type": "pong",
  "timestamp": "2024-01-20T10:00:00.000Z"
}
```

**実装例**:

```typescript
// 30秒ごとにping送信
const pingInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

// クリーンアップ
ws.onclose = () => {
  clearInterval(pingInterval);
};
```

---

## 購読管理（オプション）

デフォルトでは全リソースの更新が配信されますが、帯域幅削減のため特定リソースのみ購読することも可能です。

### subscribe:all（デフォルト）

```typescript
{
  "type": "subscribe:all"
}
```

### 特定リソースタイプのみ購読

```typescript
{
  "type": "subscribe:tasks"
}
{
  "type": "subscribe:sessions"
}
{
  "type": "subscribe:repositories"
}
{
  "type": "subscribe:environments"
}
```

### 購読解除

```typescript
{
  "type": "unsubscribe:all"
}
{
  "type": "unsubscribe:tasks"
}
```

**注意**: MVPでは購読管理は実装しません（すべてのイベントを全クライアントに配信）。

---

## セキュリティ

### CORS設定

**MVP（現状）**: ローカル環境のみのため、すべてのオリジンを許可

**将来**: 特定オリジンのみ許可

```typescript
const cors = {
  origin: 'http://localhost:3001',
  credentials: true,
};
```

### 認証（将来）

JWT認証を実装する場合、接続時にトークンをクエリパラメータで渡します：

```
ws://localhost:3000/api/ws?token=<JWT_TOKEN>
```

サーバー側でトークンを検証：

```typescript
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');

  if (!verifyToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  // 接続許可
});
```

---

## パフォーマンス最適化

### メッセージ圧縮

大きなデータを送信する場合、圧縮を使用：

```typescript
import { compress, decompress } from 'lz-string';

// 送信時
const compressed = compress(JSON.stringify(largeData));
ws.send(compressed);

// 受信時
ws.onmessage = (event) => {
  const decompressed = decompress(event.data);
  const message = JSON.parse(decompressed);
};
```

### バッチング

複数の更新を一度に送信：

```typescript
{
  "type": "batch",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "events": [
      { "type": "task:updated", "data": { ... } },
      { "type": "task:updated", "data": { ... } },
      { "type": "task:updated", "data": { ... } }
    ]
  }
}
```

**注意**: MVPでは実装しません。

---

## UI実装パターン

### React Hooks例

```tsx
function useWebSocket() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3000/api/ws');

    socket.onopen = () => {
      console.log('Connected');
      setConnected(true);
    };

    socket.onclose = () => {
      console.log('Disconnected');
      setConnected(false);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const send = useCallback(
    (message: any) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    [ws]
  );

  const on = useCallback(
    (eventType: string, handler: (event: any) => void) => {
      if (!ws) return;

      const listener = (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        if (message.type === eventType) {
          handler(message);
        }
      };

      ws.addEventListener('message', listener);

      return () => {
        ws.removeEventListener('message', listener);
      };
    },
    [ws]
  );

  return { ws, connected, send, on };
}
```

### グローバル状態同期例

```tsx
function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const { ws, send, on } = useWebSocket();

  useEffect(() => {
    // 初回ロード
    loadInitialData().then(setState);

    // WebSocketイベントハンドラ
    on('connection:established', (event) => {
      setState(event.data);
    });

    on('task:created', (event) => {
      setState((prev) => ({
        ...prev,
        tasks: [...prev.tasks, event.data.task],
      }));
    });

    on('task:updated', (event) => {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === event.data.task.id ? event.data.task : t)),
      }));
    });

    on('task:deleted', (event) => {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== event.data.taskId),
      }));
    });

    // ... 他のイベントハンドラ
  }, [on]);

  return <AppContext.Provider value={{ state, send }}>{children}</AppContext.Provider>;
}
```
