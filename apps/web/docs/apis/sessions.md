# Claude Sessions API

Claude実行セッションに関するAPI仕様です。Claude Code CLI互換の双方向リアルタイム通信を実現します。

**MVP注**: この仕様はPhase 4〜6を含む完全版です。MVPでは以下の制限があります:

- **bypass permissions 前提**: `waiting_for_permission` 状態は使用せず、ツール実行を自動承認
- **status**: `running` | `paused` | `completed` | `failed` | `cancelled` のみ
- **許可関連機能**: `session:respond_permission` は Phase 6 以降で実装

---

## 設計

- **REST API**: セッションデータの取得 + 変更操作（fallback用）
- **WebSocket (Socket.IO)**: セッションの作成・操作・リアルタイムログ配信（優先）
- **共通Controller層**: WebSocketとREST APIの両方から呼び出される共通ロジック

**重要**: すべての変更操作（POST/DELETE）は、WebSocketとREST APIの両方で実装必須です。これにより、WebSocket接続不可時でも、セッションの開始・キャンセル等の基本操作が可能になります。

**注意**: リアルタイム性が必要な操作（session:send_message, session:interrupt, session:respond_permission, session:resume）はWebSocketでのみ利用可能です。

---

## REST API

### GET /api/sessions

セッション一覧を取得します。

#### クエリパラメータ

| パラメータ | 型                                                              | 必須 | 説明                                 |
| ---------- | --------------------------------------------------------------- | ---- | ------------------------------------ |
| status     | 'running' \| 'paused' \| 'completed' \| 'failed' \| 'cancelled' | ✗    | ステータスでフィルタ（MVPでは5種類） |
| taskId     | string                                                          | ✗    | タスクIDでフィルタ                   |

**注**: Phase 6以降で `waiting_for_permission` を追加予定。

#### レスポンス

```typescript
{
  "data": {
    "sessions": ClaudeSession[]
  }
}
```

#### 例

```bash
# アクティブなセッションを取得
GET /api/sessions?status=running

# 特定タスクのセッション履歴を取得
GET /api/sessions?taskId=550e8400-e29b-41d4-a716-446655440000
```

---

### GET /api/sessions/[id]

特定セッションの詳細を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| id         | string | セッションID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "session": ClaudeSession
  }
}
```

---

### GET /api/tasks/[id]/sessions

特定タスクのセッション一覧を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "sessions": ClaudeSession[]
  }
}
```

---

### POST /api/tasks/[id]/sessions

**Fallback用**: セッションを開始します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### リクエストボディ

```typescript
{
  "prompt": string  // 必須、Claudeへの指示
}
```

#### レスポンス

```typescript
{
  "data": {
    "session": ClaudeSession  // status: 'running'
  }
}
```

**処理**: WebSocketの `session:start` と同じController層を呼び出します。

**制限**: REST APIで開始したセッションは、リアルタイムログ配信を受け取れません。セッション完了後に `GET /api/sessions/[id]` でログを取得してください。

---

### POST /api/sessions/[id]/message

**Fallback用**: 実行中のセッションに追加メッセージを送信します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| id         | string | セッションID（UUID） |

#### リクエストボディ

```typescript
{
  "message": string  // 追加の指示
}
```

#### レスポンス

```typescript
{
  "data": {
    "sessionId": string,
    "message": string  // 受信したメッセージ
  }
}
```

**処理**: WebSocketの `session:send_message` と同じController層を呼び出します。

---

### POST /api/sessions/[id]/interrupt

**Fallback用**: 実行中のセッションを中断します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| id         | string | セッションID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "session": ClaudeSession  // status: 'paused'
  }
}
```

**処理**: WebSocketの `session:interrupt` と同じController層を呼び出します。

---

### POST /api/sessions/[id]/permission

**Fallback用**: 許可プロンプトに応答します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| id         | string | セッションID（UUID） |

#### リクエストボディ

```typescript
{
  "approved": boolean,     // true: 許可, false: 拒否
  "response"?: string      // オプション、追加の応答
}
```

#### レスポンス

```typescript
{
  "data": {
    "session": ClaudeSession  // status: 'running' or 'failed'
  }
}
```

**処理**: WebSocketの `session:respond_permission` と同じController層を呼び出します。

---

### POST /api/sessions/[id]/resume

**Fallback用**: 中断したセッションを再開します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| id         | string | セッションID（UUID） |

#### リクエストボディ

```typescript
{
  "message"?: string  // オプション、再開時の追加指示
}
```

#### レスポンス

```typescript
{
  "data": {
    "session": ClaudeSession  // status: 'running'
  }
}
```

**処理**: WebSocketの `session:resume` と同じController層を呼び出します。

---

### DELETE /api/sessions/[id]

**Fallback用**: セッションをキャンセルまたは削除します（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| id         | string | セッションID（UUID） |

#### クエリパラメータ

| パラメータ | 型      | 必須 | 説明                                                            |
| ---------- | ------- | ---- | --------------------------------------------------------------- |
| cancel     | boolean | ✗    | true: セッションキャンセル、false: セッション削除（デフォルト） |

#### レスポンス

```typescript
{
  "data": {
    "sessionId": string
  }
}
```

**処理**:

- `cancel=true`: WebSocketの `session:cancel` と同じController層を呼び出します
- `cancel=false`（デフォルト）: WebSocketの `session:delete` と同じController層を呼び出します

---

## WebSocket Events

### クライアント → サーバー

#### session:start

新しいClaude実行セッションを開始します。

```typescript
{
  "type": "session:start",
  "data": {
    "taskId": string,    // 必須
    "prompt": string     // 必須、Claudeへの指示
  }
}
```

#### session:send_message

**実行中のセッションに追加メッセージを送信**します（Claude Code CLIの途中メッセージ送信と同等）。

```typescript
{
  "type": "session:send_message",
  "data": {
    "sessionId": string,  // 必須
    "message": string     // 追加の指示（例: 「TypeScriptで書いて」）
  }
}
```

**使用タイミング**: セッションが `running` 状態の時

#### session:interrupt

**実行中のセッションを中断**します（ESC相当）。

```typescript
{
  "type": "session:interrupt",
  "data": {
    "sessionId": string  // 必須
  }
}
```

**使用タイミング**: セッションが `running` 状態の時

**結果**: セッション状態が `paused` に変更される

#### session:respond_permission

**許可プロンプトに応答**します（ツール実行、ファイル書き込みなどの承認）。

**注**: この機能は Phase 6 以降で実装予定です。MVPでは bypass permissions のため使用しません。

```typescript
{
  "type": "session:respond_permission",
  "data": {
    "sessionId": string,     // 必須
    "approved": boolean,     // true: 許可, false: 拒否
    "response"?: string      // オプション、追加の応答
  }
}
```

**使用タイミング**: セッションが `waiting_for_permission` 状態の時（Phase 6以降）

**結果**:

- `approved: true` → セッション状態が `running` に戻る
- `approved: false` → セッション状態が `failed` になる

#### session:resume

**中断したセッションを再開**します。

```typescript
{
  "type": "session:resume",
  "data": {
    "sessionId": string,  // 必須
    "message"?: string    // オプション、再開時の追加指示
  }
}
```

**使用タイミング**: セッションが `paused` 状態の時

**結果**: セッション状態が `running` に戻る

#### session:cancel

**セッションをキャンセル**します。

```typescript
{
  "type": "session:cancel",
  "data": {
    "sessionId": string  // 必須
  }
}
```

**使用タイミング**: `running`, `paused`, `waiting_for_permission` 状態の時

**結果**: セッション状態が `cancelled` になる

#### session:delete

**セッションを削除**します（完了済みセッションの削除）。

```typescript
{
  "type": "session:delete",
  "data": {
    "sessionId": string  // 必須
  }
}
```

**使用タイミング**: `completed`, `failed`, `cancelled` 状態の時

---

### サーバー → クライアント

#### session:created

セッション作成が完了しました。

```typescript
{
  "type": "session:created",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "session": ClaudeSession  // status: 'running'
  }
}
```

#### session:started

Claude実行が開始されました（`session:created` の直後に送信されます）。

```typescript
{
  "type": "session:started",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "session": ClaudeSession  // status: 'running'
  }
}
```

#### session:log

**リアルタイムログ配信**（ストリーミング）。

```typescript
{
  "type": "session:log",
  "timestamp": "2024-01-20T10:00:10.000Z",
  "data": {
    "sessionId": string,
    "log": LogEntry  // ツール実行、ファイル操作、思考過程など
  }
}
```

**LogEntry型**:

```typescript
interface LogEntry {
  timestamp: string; // ISO 8601
  type: 'tool_use' | 'file_operation' | 'thinking' | 'message' | 'error';
  content: string;
  metadata?: any; // ログタイプに応じた追加情報
}
```

#### session:message_received

追加メッセージ受信を確認しました（`session:send_message` への応答）。

```typescript
{
  "type": "session:message_received",
  "timestamp": "2024-01-20T10:01:00.000Z",
  "data": {
    "sessionId": string,
    "message": string  // 受信したメッセージ
  }
}
```

#### session:waiting_for_permission

**許可プロンプト表示**（ツール実行、ファイル書き込みなどの承認が必要）。

**注**: この機能は Phase 6 以降で実装予定です。MVPでは bypass permissions のため、このイベントは発生しません。

```typescript
{
  "type": "session:waiting_for_permission",
  "timestamp": "2024-01-20T10:01:30.000Z",
  "data": {
    "sessionId": string,
    "taskId": string,
    "prompt": {
      "type": "tool_use" | "file_write" | "bash_command",
      "description": string,  // 例: "Edit src/auth/login.ts"
      "details": any          // 操作の詳細情報
    },
    "session": ClaudeSession  // status: 'waiting_for_permission'
  }
}
```

**UI要件（Phase 6以降）**: ユーザーに許可/拒否を求めるプロンプトを表示

#### session:interrupted

セッション中断を確認しました（`session:interrupt` への応答）。

```typescript
{
  "type": "session:interrupted",
  "timestamp": "2024-01-20T10:02:00.000Z",
  "data": {
    "sessionId": string,
    "session": ClaudeSession  // status: 'paused'
  }
}
```

#### session:resumed

セッション再開を確認しました（`session:resume` への応答）。

```typescript
{
  "type": "session:resumed",
  "timestamp": "2024-01-20T10:03:00.000Z",
  "data": {
    "sessionId": string,
    "session": ClaudeSession  // status: 'running'
  }
}
```

#### session:status_changed

セッション状態が変更されました（汎用）。

```typescript
{
  "type": "session:status_changed",
  "timestamp": "2024-01-20T10:01:00.000Z",
  "data": {
    "sessionId": string,
    "oldStatus": ClaudeSessionStatus,
    "newStatus": ClaudeSessionStatus,
    "session": ClaudeSession  // 最新の状態
  }
}
```

#### session:completed

セッションが正常完了しました。

```typescript
{
  "type": "session:completed",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "data": {
    "sessionId": string,
    "taskId": string,
    "result"?: string,         // 実行結果（オプション）
    "session": ClaudeSession   // status: 'completed'
  }
}
```

#### session:failed

セッションが失敗しました。

```typescript
{
  "type": "session:failed",
  "timestamp": "2024-01-20T10:15:00.000Z",
  "data": {
    "sessionId": string,
    "taskId": string,
    "error": string,           // エラーメッセージ
    "session": ClaudeSession   // status: 'failed'
  }
}
```

#### session:cancelled

セッションがキャンセルされました（`session:cancel` への応答）。

```typescript
{
  "type": "session:cancelled",
  "timestamp": "2024-01-20T10:05:00.000Z",
  "data": {
    "sessionId": string,
    "taskId": string,
    "session": ClaudeSession  // status: 'cancelled'
  }
}
```

#### session:deleted

セッションが削除されました（`session:delete` への応答）。

```typescript
{
  "type": "session:deleted",
  "timestamp": "2024-01-20T11:00:00.000Z",
  "data": {
    "sessionId": string
  }
}
```

---

## Claude Code CLI互換フロー

```
1. ユーザーがセッション開始
   WebSocket: session:start
   {
     "taskId": "xxx",
     "prompt": "ログイン機能を実装して"
   }
   ↓
2. サーバー: session:created → session:started
   UI: セッションモニターに表示、status: 'running'

3. Claude実行中（リアルタイムストリーミング）
   WebSocket: session:log × N回
   UI: ログをリアルタイム表示

4. ユーザーが追加メッセージ送信（実行中）
   WebSocket: session:send_message
   {
     "sessionId": "xxx",
     "message": "TypeScriptで書いて"
   }
   ↓
   WebSocket: session:message_received
   Claude: 追加指示を反映して実行継続

5. Claudeがツール実行の許可を求める
   WebSocket: session:waiting_for_permission
   {
     "prompt": {
       "type": "file_write",
       "description": "Edit src/auth/login.ts",
       "details": {...}
     }
   }
   ↓
   UI: 許可プロンプトを表示、status: 'waiting_for_permission'

6. ユーザーが許可
   WebSocket: session:respond_permission
   {
     "sessionId": "xxx",
     "approved": true
   }
   ↓
   WebSocket: session:resumed
   Claude: ツール実行して処理継続、status: 'running'

7. ユーザーが中断（ESC）
   WebSocket: session:interrupt
   {
     "sessionId": "xxx"
   }
   ↓
   WebSocket: session:interrupted
   UI: 再開ボタン表示、status: 'paused'

8. ユーザーが再開
   WebSocket: session:resume
   {
     "sessionId": "xxx",
     "message": "続きを実装して"
   }
   ↓
   WebSocket: session:resumed
   Claude: 処理再開、status: 'running'

9. 完了
   WebSocket: session:completed
   UI: 完了表示、status: 'completed'
```

---

## UI実装例

```tsx
function SessionController({ session }: { session: ClaudeSession }) {
  const ws = useWebSocket();
  const [message, setMessage] = useState('');

  const sendMessage = () => {
    ws.send({
      type: 'session:send_message',
      data: { sessionId: session.id, message },
    });
    setMessage('');
  };

  const interrupt = () => {
    ws.send({
      type: 'session:interrupt',
      data: { sessionId: session.id },
    });
  };

  const resume = () => {
    ws.send({
      type: 'session:resume',
      data: { sessionId: session.id },
    });
  };

  const respondPermission = (approved: boolean) => {
    ws.send({
      type: 'session:respond_permission',
      data: { sessionId: session.id, approved },
    });
  };

  return (
    <div>
      {/* リアルタイムログ */}
      <LogViewer logs={session.logs} />

      {/* 許可プロンプト */}
      {session.status === 'waiting_for_permission' && (
        <PermissionPrompt
          prompt={session.permissionPrompt}
          onApprove={() => respondPermission(true)}
          onDeny={() => respondPermission(false)}
        />
      )}

      {/* 実行中: メッセージ入力 + 中断 */}
      {session.status === 'running' && (
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="追加の指示..."
          />
          <button onClick={sendMessage}>Send</button>
          <button onClick={interrupt}>Interrupt (ESC)</button>
        </div>
      )}

      {/* 中断中: 再開ボタン */}
      {session.status === 'paused' && <button onClick={resume}>Resume</button>}
    </div>
  );
}
```
