# Claude Session State Mapping

## 状態定義

```typescript
type ClaudeSessionStatus = 'idle' | 'running' | 'success' | 'error';
```

## 状態遷移

```
idle → running → success
              → error
```

## 状態判定ロジック

### 初期状態（セッション作成時）

- **status**: `'idle'`
- **agentSessionId**: `undefined`
- **logs**: `[]`
- **条件**: セッションが作成された直後、メッセージ未送信

### 実行中（メッセージ送信〜完了まで）

- **status**: `'running'`
- **条件**:
  - message API が呼ばれた直後
  - SDK からメッセージをストリーム受信中
  - interrupt() で中断されても running のまま（次の message で自動再開）

### 成功終了

- **status**: `'success'`
- **条件**: SDK から `SDKResultMessage` を受信し、`subtype === 'success'`
- **completedAt**: 完了時刻が記録される

### エラー終了

- **status**: `'error'`
- **条件**: SDK から `SDKResultMessage` を受信し、`subtype` が以下のいずれか:
  - `'error_during_execution'`
  - `'error_max_turns'`
  - `'error_max_budget_usd'`
  - `'error_max_structured_output_retries'`
- **completedAt**: 完了時刻が記録される

## SDK メッセージと状態の対応

| SDK Message Type | SDK Subtype | ClaudeSession.status |
| ---------------- | ----------- | -------------------- |
| `system`         | `init`      | `running` (維持)     |
| `assistant`      | -           | `running` (維持)     |
| `user`           | -           | `running` (維持)     |
| `result`         | `success`   | **`success`** に遷移 |
| `result`         | `error_*`   | **`error`** に遷移   |
| `stream_event`   | -           | `running` (維持)     |
| `tool_progress`  | -           | `running` (維持)     |

## Task.claudeState との関係

Task.claudeState は複数セッションの統合状態を表す:

```typescript
type ClaudeState = 'idle' | 'running';
```

**判定ロジック:**

- いずれかのセッションが `status === 'running'` → `claudeState: 'running'`
- すべてのセッションが `status !== 'running'` → `claudeState: 'idle'`

## 状態取得関数

```typescript
function getClaudeStatus(session: ClaudeSession): ClaudeSessionStatus {
  return session.status;
}
```

セッションの status フィールドがそのまま Claude の状態を表します。
