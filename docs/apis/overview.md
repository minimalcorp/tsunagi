# API Overview

Tsunagi API仕様の全体像を説明します。

**MVP注**: この仕様はPhase 4〜6を含む完全版です。MVPでは以下の制限があります:

- **Phase 5（WebSocket）は将来実装**: MVPではREST APIのみを使用
- **bypass permissions 前提**: 許可関連機能（`session:waiting_for_permission`、`session:respond_permission`）は Phase 6 以降で実装

---

## ドキュメント構成

```
docs/apis/
├── overview.md         # 本ファイル: API全体像、設計思想、基本フロー
├── common.md           # 共通仕様（レスポンス形式、エラー、認証）
├── tasks.md            # Tasks API詳細
├── sessions.md         # Claude Sessions API詳細
├── repositories.md     # Repositories/Owners API詳細
├── environments.md     # Environment Variables API詳細
├── websocket.md        # WebSocket API詳細
└── estimation.md       # Order/Effort Estimation API詳細
```

---

## クイックスタート

### 1. 全体像を理解する（本ファイル）

- REST API + WebSocket の設計思想
- 全エンドポイント一覧
- 全WebSocketイベント一覧
- 基本フロー

### 2. 共通仕様を確認する

**[common.md](./common.md)** を読んでください。

- レスポンス形式
- エラーハンドリング
- HTTPステータスコード
- WebSocketメッセージ形式

### 3. リソース別の詳細を確認する

必要なリソースのドキュメントを読んでください：

- **タスク管理**: [tasks.md](./tasks.md)
- **Claude実行**: [sessions.md](./sessions.md)
- **リポジトリ管理**: [repositories.md](./repositories.md)
- **環境変数**: [environments.md](./environments.md)
- **見積もり**: [estimation.md](./estimation.md)

### 4. WebSocket実装を理解する

**[websocket.md](./websocket.md)** を読んでください。

- WebSocket接続方法
- 再接続処理
- エラーハンドリング
- UI実装パターン

---

## 設計思想

### REST API + WebSocket (両方実装必須)

**アーキテクチャ:**

- **WebSocket (Socket.IO)**: リアルタイム変更操作 + 自動同期（優先）
- **REST API**: データ取得 + 変更操作（fallback用）
- **共通Controller層**: WebSocketとREST APIの両方から呼び出される共通ロジック

**重要な設計原則:**

> **すべての変更操作（POST/PUT/DELETE）は、WebSocketとREST APIの両方で実装必須**
>
> これにより、WebSocket接続不可時やSocket.IOのtransport fallbackが失敗した場合でも、
> アプリケーションが正常に動作し続けることを保証します。

**実装レイヤー:**

```
Client
  ├─ REST API (fetch)           ← fallback時に使用
  └─ Socket.IO                  ← 通常時に使用
       ├─ WebSocket (優先)
       └─ HTTP Long Polling (fallback)

Server
  ├─ REST API Handler
  ├─ Socket.IO Handler
  └─ Controller (共通ロジック層) ← 両方から呼び出される
       └─ Service (ビジネスロジック)
            └─ Data Access (JSON files)
```

**データフロー:**

```
1. 初回ロード
   REST API GET → クライアント状態初期化

2. Socket.IO接続
   ws://localhost:3000/api/ws (WebSocket)
   または
   http://localhost:3000/api/ws (HTTP Long Polling - fallback)
   ↓
   connection:established → 全リソースの現在状態を受信

3. 変更操作（通常時）
   クライアント → Socket.IO event送信
   ↓
   サーバー Controller → 共通ロジック実行
   ↓
   全クライアントにbroadcast (Socket.IO)
   ↓
   すべてのタブで自動更新

4. 変更操作（Socket.IO接続不可時）
   クライアント → REST API (POST/PUT/DELETE)
   ↓
   サーバー Controller → 共通ロジック実行
   ↓
   レスポンス返却
   ↓
   クライアントで状態更新（単一タブのみ）

5. Fallback（Socket.IO切断時）
   REST API GET → 最新状態を再取得
   自動再接続試行
```

**Socket.IOのTransport Fallback:**

Socket.IOは自動的に以下の順序でtransportを試行します:

1. **WebSocket** (優先) - 低レイテンシ、双方向通信
2. **HTTP Long Polling** (fallback) - WebSocket使用不可時

この機構により、企業ファイアウォールなどWebSocketが使えない環境でも動作します。

**メリット:**

- ✅ 複数タブ間のリアルタイム同期（WebSocket使用時）
- ✅ 堅牢性: WebSocket不可時もREST APIで動作継続
- ✅ 実装の共通化: Controller層で1回だけロジックを書く
- ✅ 段階的移行: REST APIから始めてSocket.IOを後から追加可能
- ✅ 自動fallback: Socket.IOがWebSocket→Pollingを自動切り替え

---

## REST API一覧

> **注**: すべての変更操作（POST/PUT/DELETE）はSocket.IO接続不可時のfallback用として必須実装です。

### Tasks

| Method | Endpoint        | 説明                         | Fallback | 備考                                      |
| ------ | --------------- | ---------------------------- | -------- | ----------------------------------------- |
| GET    | /api/tasks      | タスク一覧取得（フィルタ可） | -        | `?includeDeleted=true` で削除済みも取得可 |
| GET    | /api/tasks/[id] | タスク詳細取得               | -        | -                                         |
| POST   | /api/tasks      | タスク作成                   | ✓        | -                                         |
| PUT    | /api/tasks/[id] | タスク更新                   | ✓        | -                                         |
| DELETE | /api/tasks/[id] | タスク論理削除               | ✓        | Worktree/ブランチは物理削除               |

### Claude Sessions

| Method | Endpoint                      | 説明                             | Fallback |
| ------ | ----------------------------- | -------------------------------- | -------- |
| GET    | /api/sessions                 | セッション一覧取得（フィルタ可） | -        |
| GET    | /api/sessions/[id]            | セッション詳細取得               | -        |
| GET    | /api/tasks/[id]/sessions      | タスクのセッション一覧取得       | -        |
| POST   | /api/tasks/[id]/sessions      | セッション開始                   | ✓        |
| POST   | /api/sessions/[id]/message    | 追加メッセージ送信               | ✓        |
| POST   | /api/sessions/[id]/interrupt  | セッション中断                   | ✓        |
| POST   | /api/sessions/[id]/permission | 許可応答                         | ✓        |
| POST   | /api/sessions/[id]/resume     | セッション再開                   | ✓        |
| DELETE | /api/sessions/[id]            | セッションキャンセル             | ✓        |

### Repositories & Owners

| Method | Endpoint                                | 説明               | Fallback |
| ------ | --------------------------------------- | ------------------ | -------- |
| GET    | /api/owners                             | Owner一覧取得      | -        |
| GET    | /api/owners/[owner]/repositories        | リポジトリ一覧取得 | -        |
| GET    | /api/owners/[owner]/repositories/[repo] | リポジトリ詳細取得 | -        |
| POST   | /api/clone                              | リポジトリクローン | ✓        |
| PUT    | /api/owners/[owner]/repositories/[repo] | リポジトリ更新     | ✓        |
| DELETE | /api/owners/[owner]/repositories/[repo] | リポジトリ削除     | ✓        |
| DELETE | /api/owners/[owner]                     | Owner削除          | ✓        |

### Environment Variables

| Method | Endpoint                                          | 説明                   | Fallback |
| ------ | ------------------------------------------------- | ---------------------- | -------- |
| GET    | /api/env                                          | グローバル環境変数取得 | -        |
| GET    | /api/owners/[owner]/env                           | Owner環境変数取得      | -        |
| GET    | /api/owners/[owner]/repositories/[repo]/env       | Repository環境変数取得 | -        |
| POST   | /api/env                                          | グローバル環境変数設定 | ✓        |
| POST   | /api/owners/[owner]/env                           | Owner環境変数設定      | ✓        |
| POST   | /api/owners/[owner]/repositories/[repo]/env       | Repository環境変数設定 | ✓        |
| DELETE | /api/env/[key]                                    | グローバル環境変数削除 | ✓        |
| DELETE | /api/owners/[owner]/env/[key]                     | Owner環境変数削除      | ✓        |
| DELETE | /api/owners/[owner]/repositories/[repo]/env/[key] | Repository環境変数削除 | ✓        |

### Estimation

| Method | Endpoint                 | 説明                           | Fallback |
| ------ | ------------------------ | ------------------------------ | -------- |
| GET    | /api/tasks/estimate      | 全todoタスクの見積もり状態取得 | -        |
| GET    | /api/tasks/[id]/estimate | 単一タスクの見積もり状態取得   | -        |
| POST   | /api/tasks/estimate      | 全todoタスク見積もり実行       | ✓        |
| POST   | /api/tasks/[id]/estimate | 単一タスク見積もり実行         | ✓        |

---

## WebSocket Events

### 接続

```
ws://localhost:3000/api/ws
```

### クライアント → サーバー（変更操作）

#### Tasks

| Event       | 説明       |
| ----------- | ---------- |
| task:create | タスク作成 |
| task:update | タスク更新 |
| task:delete | タスク削除 |

#### Claude Sessions

| Event                      | 説明                       |
| -------------------------- | -------------------------- |
| session:start              | セッション開始             |
| session:send_message       | 実行中に追加メッセージ送信 |
| session:interrupt          | セッション中断（ESC相当）  |
| session:respond_permission | 許可プロンプトに応答       |
| session:resume             | 中断したセッションを再開   |
| session:cancel             | セッションキャンセル       |
| session:delete             | セッション削除             |

#### Repositories

| Event             | 説明                                |
| ----------------- | ----------------------------------- |
| clone:start       | Gitリポジトリをクローン（初回登録） |
| repository:update | リポジトリ設定更新                  |
| repository:delete | リポジトリ削除                      |
| owner:delete      | Owner削除（全リポジトリ削除）       |

#### Environment Variables

| Event      | 説明                                             |
| ---------- | ------------------------------------------------ |
| env:set    | 環境変数設定（3つのスコープ: global/owner/repo） |
| env:delete | 環境変数削除                                     |

#### Estimation

| Event         | 説明                   |
| ------------- | ---------------------- |
| estimate:all  | 全todoタスクを見積もり |
| estimate:task | 単一タスクを見積もり   |

### サーバー → クライアント（リアルタイム更新）

すべての変更操作に対して、対応するイベントが全クライアントにブロードキャストされます。

#### Tasks

| Event        | 説明           |
| ------------ | -------------- |
| task:created | タスク作成完了 |
| task:updated | タスク更新完了 |
| task:deleted | タスク削除完了 |

#### Claude Sessions

| Event                          | 説明                     |
| ------------------------------ | ------------------------ |
| session:created                | セッション作成完了       |
| session:started                | セッション実行開始       |
| session:log                    | ログ追加（リアルタイム） |
| session:message_received       | メッセージ受信確認       |
| session:waiting_for_permission | 許可プロンプト表示       |
| session:interrupted            | 中断確認                 |
| session:resumed                | 再開確認                 |
| session:status_changed         | ステータス変更           |
| session:completed              | セッション完了           |
| session:failed                 | セッション失敗           |
| session:cancelled              | セッションキャンセル完了 |
| session:deleted                | セッション削除完了       |

#### Repositories

| Event              | 説明                   |
| ------------------ | ---------------------- |
| repository:created | リポジトリクローン完了 |
| repository:updated | リポジトリ更新完了     |
| repository:deleted | リポジトリ削除完了     |
| owner:deleted      | Owner削除完了          |

#### Environment Variables

| Event       | 説明             |
| ----------- | ---------------- |
| env:updated | 環境変数設定完了 |
| env:deleted | 環境変数削除完了 |

#### Estimation

| Event              | 説明         |
| ------------------ | ------------ |
| estimate:completed | 見積もり完了 |
| estimate:failed    | 見積もり失敗 |

---

## 基本フロー

### リポジトリ登録からタスク作成まで

```
1. Git repository URLを入力
   ↓
   WebSocket: clone:start
   {
     "gitUrl": "https://github.com/minimalcorp/tsunagi.git",
     "authToken": "ghp_xxx"
   }
   ↓
2. サーバー: owner/repo自動判定 + bare clone実行
   ↓
3. WebSocket: repository:created
   → UI: リポジトリ一覧に自動追加

4. タスク作成
   ↓
   WebSocket: task:create
   {
     "owner": "minimalcorp",
     "repo": "tsunagi",
     "title": "ログイン機能の実装",
     "branch": "feat/auth"
   }
   ↓
5. サーバー: worktree/branch自動作成
   → ~/.tsunagi/workspaces/minimalcorp/tsunagi/feat-auth/
   (bare repository: ~/.tsunagi/workspaces/minimalcorp/tsunagi/.bare)
   ↓
6. WebSocket: task:created
   → UI: タスク一覧に自動追加（全タブで同期）

7. Claude実行開始
   ↓
   WebSocket: session:start
   {
     "taskId": "xxx",
     "prompt": "ログイン機能を実装して"
   }
   ↓
8. WebSocket: session:started
   → UI: セッションモニターに表示

9. Claude実行中
   WebSocket: session:log × N回
   → UI: リアルタイムログ表示

10. ユーザーが途中で追加指示
   WebSocket: session:send_message
   {
     "sessionId": "xxx",
     "message": "TypeScriptで書いて"
   }
   ↓
   Claude: 追加指示を反映して継続

11. 完了
   WebSocket: session:completed
   → UI: 完了表示
```

---

## 各ファイルの役割

### [common.md](./common.md)

**対象**: API実装者、フロントエンド開発者

**内容**:

- レスポンス形式
- エラーハンドリング
- HTTPステータスコード
- WebSocketメッセージ形式
- タイムスタンプ形式

### [tasks.md](./tasks.md)

**対象**: タスク管理機能の実装者

**内容**:

- GET /api/tasks, GET /api/tasks/[id]
- WebSocketイベント: task:create, task:update, task:delete
- 自動worktree/branch管理
- UI実装例

### [sessions.md](./sessions.md)

**対象**: Claude実行機能の実装者（最も複雑）

**内容**:

- GET /api/sessions, GET /api/sessions/[id]
- WebSocketイベント: session:start, session:send_message, session:interrupt, session:respond_permission, session:resume, session:cancel, etc.
- Claude Code CLI互換フロー
- リアルタイムログ配信
- UI実装例

### [repositories.md](./repositories.md)

**対象**: リポジトリ管理機能の実装者

**内容**:

- GET /api/owners, GET /api/owners/[owner]/repositories, GET /api/owners/[owner]/repositories/[repo]
- WebSocketイベント: clone:start, repository:update, repository:delete, owner:delete
- Bare repositoryクローン
- UI実装例

### [environments.md](./environments.md)

**対象**: 環境変数管理機能の実装者

**内容**:

- GET /api/env (3つのスコープ)
- WebSocketイベント: env:set, env:delete
- スコープ優先順位（repository > owner > global）
- UI実装例

### [websocket.md](./websocket.md)

**対象**: WebSocket通信の実装者、フロントエンド開発者（重要）

**内容**:

- WebSocket接続方法
- メッセージ形式
- 全イベント一覧（参照）
- エラーハンドリング
- 再接続処理
- Heartbeat / Ping-Pong
- UI実装パターン（React Hooks例）

### [estimation.md](./estimation.md)

**対象**: 見積もり機能の実装者

**内容**:

- GET /api/tasks/estimate, GET /api/tasks/[id]/estimate
- WebSocketイベント: estimate:all, estimate:task
- 見積もりアルゴリズム
- プログレス表示
- UI実装例

---

## 実装の優先順位

1. **WebSocket基盤** ([websocket.md](./websocket.md))
   - 接続、再接続、エラーハンドリング
   - グローバル状態管理

2. **リポジトリ管理** ([repositories.md](./repositories.md))
   - clone:start でbare repositoryをセットアップ

3. **タスク管理** ([tasks.md](./tasks.md))
   - task:create, task:update, task:delete
   - 自動worktree/branch作成

4. **Claude実行** ([sessions.md](./sessions.md))
   - session:start, session:send_message, session:interrupt
   - リアルタイムログ配信
   - 許可プロンプト

5. **環境変数** ([environments.md](./environments.md))
   - env:set, env:delete

6. **見積もり** ([estimation.md](./estimation.md))
   - estimate:all, estimate:task

---

## Quick Actions（コマンドコピー方式）

Tsunagi UIは、ターミナルやVS Codeを直接起動する代わりに、**コマンドのクリップボードコピー**方式を採用しています。

### 設計思想

- **シンプル**: APIエンドポイント不要、フロントエンドのみで完結
- **柔軟**: ユーザーが任意のターミナル・エディタを使用可能
- **セキュア**: サーバー側からホストマシンのプロセス起動が不要

### 提供されるコマンド

#### VS Code起動

```bash
code ~/.tsunagi/workspaces/{owner}/{repo}/{branch}
# bare repository: ~/.tsunagi/workspaces/{owner}/{repo}/.bare
```

**UI実装**: タスク詳細画面の「📝 Open in VS Code」ボタンをクリック

#### ターミナルで開く

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}/{branch}
# bare repository: ~/.tsunagi/workspaces/{owner}/{repo}/.bare
```

**UI実装**: タスク詳細画面の「💻 Open in Terminal」ボタンをクリック

#### パスコピー

```bash
~/.tsunagi/workspaces/{owner}/{repo}/{branch}
# bare repository: ~/.tsunagi/workspaces/{owner}/{repo}/.bare
```

**UI実装**: タスク詳細画面の「📋 Copy Path」ボタンをクリック

### 詳細仕様

実装の詳細は [pages/task-detail.md](../pages/task-detail.md#4-quick-actions) を参照してください。
