# API Specification

> **注**: API仕様は `api-specifications/` ディレクトリに分割されました。

このファイルは、API仕様の全体像を把握するための案内ファイルです。詳細な仕様は各ファイルを参照してください。

---

## ドキュメント構成

```
docs/api-specifications/
├── overview.md         # API全体像、設計思想、基本フロー
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

### 1. 全体像を理解する

**[overview.md](./api-specifications/overview.md)** を読んでください。

- REST API (GET only) + WebSocket (mutations) の設計思想
- 全エンドポイント一覧
- 全WebSocketイベント一覧
- 基本フロー

### 2. 共通仕様を確認する

**[common.md](./api-specifications/common.md)** を読んでください。

- レスポンス形式
- エラーハンドリング
- HTTPステータスコード
- WebSocketメッセージ形式

### 3. リソース別の詳細を確認する

必要なリソースのドキュメントを読んでください：

- **タスク管理**: [tasks.md](./api-specifications/tasks.md)
- **Claude実行**: [sessions.md](./api-specifications/sessions.md)
- **リポジトリ管理**: [repositories.md](./api-specifications/repositories.md)
- **環境変数**: [environments.md](./api-specifications/environments.md)
- **見積もり**: [estimation.md](./api-specifications/estimation.md)

### 4. WebSocket実装を理解する

**[websocket.md](./api-specifications/websocket.md)** を読んでください。

- WebSocket接続方法
- 再接続処理
- エラーハンドリング
- UI実装パターン

---

## 設計の要点

### REST API (GET only)

データ取得のみ。すべての変更操作はWebSocketで行います。

```
GET /api/tasks
GET /api/tasks/[id]
GET /api/sessions
GET /api/sessions/[id]
GET /api/owners
GET /api/owners/[owner]/repositories
GET /api/owners/[owner]/repositories/[repo]
GET /api/env
GET /api/owners/[owner]/env
GET /api/owners/[owner]/repositories/[repo]/env
```

### WebSocket (mutations + realtime)

すべての変更操作とリアルタイム更新。

```
ws://localhost:3000/api/ws
```

**主なイベント**:

- `task:create`, `task:update`, `task:delete`
- `session:start`, `session:send_message`, `session:interrupt`, `session:respond_permission`, etc.
- `clone:start`, `repository:update`, `repository:delete`
- `env:set`, `env:delete`
- `estimate:all`, `estimate:task`

### Claude Code CLI互換

WebSocketを使用して、Claude Code CLIと同等の双方向リアルタイム通信を実現：

- ✅ 処理の途中でも新しいメッセージを送れる
- ✅ 処理の途中でESCで中断できる
- ✅ 許可を求められたら回答を提出できる
- ✅ すべてリアルタイムでUI更新される
- ✅ 複数タブ間で自動同期される

---

## データフロー

```
1. 初回ロード
   REST API GET → クライアント状態初期化

2. WebSocket接続
   ws://localhost:3000/api/ws
   ↓
   connection:established → 全リソースの現在状態を受信

3. 変更操作
   クライアント → WebSocket event送信
   ↓
   サーバー処理 → 全クライアントにbroadcast
   ↓
   すべてのタブで自動更新

4. Fallback（WebSocket切断時）
   REST API GET → 最新状態を再取得
```

---

## 各ファイルの役割

### [overview.md](./api-specifications/overview.md)

**対象**: 開発者全員（必読）

**内容**:

- API設計思想
- 全エンドポイント一覧表
- 全WebSocketイベント一覧表
- 基本フロー図

### [common.md](./api-specifications/common.md)

**対象**: API実装者、フロントエンド開発者

**内容**:

- レスポンス形式
- エラーハンドリング
- HTTPステータスコード
- WebSocketメッセージ形式
- タイムスタンプ形式

### [tasks.md](./api-specifications/tasks.md)

**対象**: タスク管理機能の実装者

**内容**:

- GET /api/tasks, GET /api/tasks/[id]
- WebSocketイベント: task:create, task:update, task:delete
- 自動worktree/branch管理
- UI実装例

### [sessions.md](./api-specifications/sessions.md)

**対象**: Claude実行機能の実装者（最も複雑）

**内容**:

- GET /api/sessions, GET /api/sessions/[id]
- WebSocketイベント: session:start, session:send_message, session:interrupt, session:respond_permission, session:resume, session:cancel, etc.
- Claude Code CLI互換フロー
- リアルタイムログ配信
- UI実装例

### [repositories.md](./api-specifications/repositories.md)

**対象**: リポジトリ管理機能の実装者

**内容**:

- GET /api/owners, GET /api/owners/[owner]/repositories, GET /api/owners/[owner]/repositories/[repo]
- WebSocketイベント: clone:start, repository:update, repository:delete, owner:delete
- Bare repositoryクローン
- UI実装例

### [environments.md](./api-specifications/environments.md)

**対象**: 環境変数管理機能の実装者

**内容**:

- GET /api/env (3つのスコープ)
- WebSocketイベント: env:set, env:delete
- スコープ優先順位（repository > owner > global）
- UI実装例

### [websocket.md](./api-specifications/websocket.md)

**対象**: WebSocket通信の実装者、フロントエンド開発者（重要）

**内容**:

- WebSocket接続方法
- メッセージ形式
- 全イベント一覧（参照）
- エラーハンドリング
- 再接続処理
- Heartbeat / Ping-Pong
- UI実装パターン（React Hooks例）

### [estimation.md](./api-specifications/estimation.md)

**対象**: 見積もり機能の実装者

**内容**:

- GET /api/tasks/estimate, GET /api/tasks/[id]/estimate
- WebSocketイベント: estimate:all, estimate:task
- 見積もりアルゴリズム
- プログレス表示
- UI実装例

---

## 実装の優先順位

1. **WebSocket基盤** ([websocket.md](./api-specifications/websocket.md))
   - 接続、再接続、エラーハンドリング
   - グローバル状態管理

2. **リポジトリ管理** ([repositories.md](./api-specifications/repositories.md))
   - clone:start でbare repositoryをセットアップ

3. **タスク管理** ([tasks.md](./api-specifications/tasks.md))
   - task:create, task:update, task:delete
   - 自動worktree/branch作成

4. **Claude実行** ([sessions.md](./api-specifications/sessions.md))
   - session:start, session:send_message, session:interrupt
   - リアルタイムログ配信
   - 許可プロンプト

5. **環境変数** ([environments.md](./api-specifications/environments.md))
   - env:set, env:delete

6. **見積もり** ([estimation.md](./api-specifications/estimation.md))
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
```

**UI実装**: タスク詳細画面の「📝 Open in VS Code」ボタンをクリック

#### ターミナルで開く

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}/{branch}
```

**UI実装**: タスク詳細画面の「💻 Open in Terminal」ボタンをクリック

#### パスコピー

```bash
~/.tsunagi/workspaces/{owner}/{repo}/{branch}
```

**UI実装**: タスク詳細画面の「📋 Copy Path」ボタンをクリック

### 詳細仕様

実装の詳細は [pages/task-detail.md](./pages/task-detail.md#4-quick-actions) を参照してください。

---

## 関連ドキュメント

- **データモデル**: [data-models.md](./data-models.md)
- **ローカルデータ**: [local-data.md](./local-data.md)
- **Git Worktree**: [git-worktree.md](./git-worktree.md)
- **ページ仕様**: [pages/](./pages/)

---

## 変更履歴

### 2024-01-21: Quick Actions（コマンドコピー方式）追加

- ターミナル/VS Code起動をコマンドコピー方式に変更
- APIエンドポイント不要、フロントエンドのClipboard APIで完結
- シンプル・柔軟・セキュアな設計を実現

### 2024-01-20: API仕様分割

- API仕様を `api-specifications/` ディレクトリに分割
- REST APIからPOST/PUT/DELETEを削除（WebSocketに統一）
- Claude Code CLI互換の双方向通信を実装
- 複数タブ間のリアルタイム同期を実現

### 以前

- すべての仕様が `api-specification.md` に集約されていた
- REST APIでPOST/PUT/DELETEをサポート
- WebSocketは補助的な役割
