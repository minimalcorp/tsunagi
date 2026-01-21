# 共通仕様

API全体で共通の仕様について説明します。

---

## ベースURL

### REST API

```
http://localhost:3000/api
```

### WebSocket

```
ws://localhost:3000/api/ws
```

---

## リクエストヘッダー（REST API）

```
Content-Type: application/json
```

---

## レスポンス形式（REST API）

### 成功レスポンス

```typescript
{
  "data": <結果データ>,
  "message"?: string  // オプション
}
```

### エラーレスポンス

```typescript
{
  "error": {
    "message": string,      // 全体のエラーメッセージ
    "code"?: string,        // エラーコード（VALIDATION_ERROR、NOT_FOUND、INTERNAL_ERROR など）
    "fields"?: Array<{      // フィールド単位のエラー（バリデーションエラー時のみ）
      key: string,          // フィールド名（例: "email", "title"）
      message: string       // エラーメッセージ（例: "Invalid email format"）
    }>
  }
}
```

---

## HTTPステータスコード（REST API）

| コード | 説明                   |
| ------ | ---------------------- |
| 200    | 成功                   |
| 400    | バリデーションエラー   |
| 404    | リソースが見つからない |
| 500    | サーバーエラー         |

---

## WebSocketメッセージ形式

### クライアント → サーバー

```typescript
{
  "type": string,      // イベントタイプ（例: "task:create", "session:start"）
  "data": object       // イベントデータ
}
```

### サーバー → クライアント

```typescript
{
  "type": string,              // イベントタイプ（例: "task:created", "session:log"）
  "timestamp": string,         // ISO 8601形式のタイムスタンプ
  "data": object               // イベントデータ
}
```

---

## エラーハンドリング

### バリデーションエラー（400）

複数フィールドのエラー:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "fields": [
      {
        "key": "title",
        "message": "Title is required"
      },
      {
        "key": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

単一フィールドのエラー:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "fields": [
      {
        "key": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### リソースが見つからない（404）

```json
{
  "error": {
    "message": "Task not found",
    "code": "NOT_FOUND"
  }
}
```

### サーバーエラー（500）

```json
{
  "error": {
    "message": "Internal server error",
    "code": "INTERNAL_ERROR"
  }
}
```

### WebSocketエラー

```typescript
{
  "type": "error",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "message": string,
    "code"?: string,
    "originalEvent"?: {  // エラーが発生した元のイベント
      "type": string,
      "data": object
    }
  }
}
```

---

## レート制限

MVPでは実装しませんが、将来的に以下のレート制限を検討：

- REST API: 100リクエスト/分
- WebSocket: 接続数制限なし（ローカル環境のみ）
- Claude実行: 10セッション同時実行まで

---

## 認証・認可

**MVP（現状）**: ローカル環境のみで動作するため認証は不要です。

**将来（複数ユーザー対応時）**:

- JWT認証を実装予定
- WebSocket接続時にトークンをクエリパラメータで渡す
  ```
  ws://localhost:3000/api/ws?token=<JWT_TOKEN>
  ```
- REST API GETリクエストにはAuthorizationヘッダーを使用
  ```
  Authorization: Bearer <JWT_TOKEN>
  ```

---

## タイムスタンプ形式

すべての日時は **ISO 8601形式（UTC）** で表現します。

**例**:

```
2024-01-20T10:00:00.000Z
```

**フィールド名**:

- `createdAt`: 作成日時
- `updatedAt`: 更新日時
- `startedAt`: 開始日時（セッション）
- `completedAt`: 完了日時（セッション、タスク）
- `timestamp`: イベント発生日時（WebSocketイベント）

---

## ページネーション

MVPでは実装しませんが、将来的に以下のページネーション方式を検討：

### クエリパラメータ

```
GET /api/tasks?page=2&limit=50
```

### レスポンス

```typescript
{
  "data": {
    "tasks": Task[],
    "pagination": {
      "page": number,
      "limit": number,
      "total": number,
      "hasNext": boolean,
      "hasPrev": boolean
    }
  }
}
```

---

## CORS設定

**MVP（現状）**: ローカル環境のみのため、すべてのオリジンを許可

**将来**: 必要に応じて特定オリジンのみ許可
