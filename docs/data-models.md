# データモデル

Tsunagiで使用するデータモデルの定義と仕様について説明します。

---

## Task（タスク）

タスクは、開発作業の単位を表すエンティティです。各タスクは特定のGitHubリポジトリ・ブランチに紐付き、Claudeによる自動化の対象となります。

### 型定義

```typescript
interface Task {
  // 識別子
  id: string; // UUID（例: "550e8400-e29b-41d4-a716-446655440000"）

  // 基本情報
  title: string; // タスクタイトル（例: "ログイン機能の実装"）
  description: string; // タスクの詳細説明

  // ステータス
  status: 'backlog' | 'planning' | 'tasking' | 'coding' | 'reviewing' | 'done'; // タスクステータス

  // Git情報
  owner: string; // GitHub owner（organization/user）
  repo: string; // GitHub repository名
  branch: string; // ブランチ名（1タスク = 1ブランチ）

  // Claude実行状態
  claudeState: 'idle' | 'running' | 'waiting'; // Claude実行状態
  prompt?: string; // Claudeへの指示（オプション）
  plan?: string; // 実行計画（オプション）

  // 工数・順序（Claude自動見積もり）
  effort?: number; // 工数（時間単位、0.5刻み）
  order?: number; // 実行順序（0, 1, 2, ...、小さいほど優先）

  // ログ
  logs: LogEntry[]; // 実行ログの配列

  // 論理削除
  deleted: boolean; // 削除フラグ（デフォルト: false）
  deletedAt?: string; // 削除日時（ISO 8601形式、削除時のみ）

  // タイムスタンプ
  createdAt: string; // 作成日時（ISO 8601形式）
  updatedAt: string; // 更新日時（ISO 8601形式）
}
```

### フィールド詳細

#### id

- **型**: `string`
- **形式**: UUID v4
- **生成**: タスク作成時に自動生成（`crypto.randomUUID()`）
- **例**: `"550e8400-e29b-41d4-a716-446655440000"`

#### title

- **型**: `string`
- **制約**: 1〜200文字
- **例**: `"ログイン機能の実装"`, `"APIエンドポイントのリファクタリング"`

#### description

- **型**: `string`
- **制約**: 0〜5000文字
- **形式**: Markdown対応（将来）
- **意味**: タスクで行うべきこと。要件定義相当。
- **例**:
  ```
  ユーザー認証機能を実装する。
  - JWT認証
  - パスワードハッシュ化
  - セッション管理
  ```

#### status

- **型**: `'backlog' | 'planning' | 'tasking' | 'coding' | 'reviewing' | 'done'`
- **初期値**: `'backlog'`
- **意味**:
  - `backlog`: タスク作成済み、未着手
  - `planning`: 要件定義・仕様作成中（成果物: docs以下のドキュメント）
  - `tasking`: 実装計画作成中（成果物: ステップバイステップの実装手順書）
  - `coding`: 実装中（成果物: ソースコード）
  - `reviewing`: 動作確認中（成果物: テスト結果、レビューコメント）
  - `done`: 完了
- **推奨遷移**:
  - `backlog` → `planning` → `tasking` → `coding` → `reviewing` → `done`
  - 任意の状態から任意の状態へ変更可能（ドラッグ&ドロップで柔軟に移動）

#### owner / repo / branch

- **型**: `string`
- **制約**:
  - `owner`: 1〜39文字、英数字とハイフン
  - `repo`: 1〜100文字
  - `branch`: 1〜255文字
- **例**:
  - `owner: "minimalcorp"`
  - `repo: "tsunagi"`
  - `branch: "feat/auth"`

#### claudeState

- **型**: `'idle' | 'running' | 'waiting'`
- **初期値**: `'idle'`
- **意味**:
  - `idle`: 実行していない
  - `running`: 現在Claudeが実行中
  - `waiting`: 実行待機中（将来、並列実行時に使用）

#### prompt

- **型**: `string | undefined`
- **制約**: 0〜10000文字
- **例**: `"このブランチでログイン機能を実装してください。JWT認証を使用してください。"`

#### plan

- **型**: `string | undefined`
- **制約**: 0〜10000文字
- **形式**: Markdown対応（将来）
- **意味**: 実行計画。このステップで実装を進める。
- **用途**: Claudeが生成した実行計画を保存、または手動で記述
- **例**:
  ```
  1. パスワードハッシュ化機能の実装
  2. JWT生成・検証機能の実装
  3. ログインエンドポイントの作成
  4. 認証ミドルウェアの実装
  5. テストコードの追加
  ```

#### effort

- **型**: `number | undefined`
- **単位**: 時間（0.5刻み）
- **範囲**: 0.5〜40時間
- **生成**: Claudeがタスク内容を分析して自動見積もり
- **例**: `2.5`（2.5時間）、`8.0`（8時間）
- **用途**: タスクの規模を可視化、優先度判定の材料

#### order

- **型**: `number | undefined`
- **範囲**: 0以上の整数（0, 1, 2, 3, ...）
- **意味**: 小さいほど優先度が高い（order 0 が最優先）
- **生成**: Claudeがタスク内容・工数・緊急性を加味して自動判定
- **例**:
  - `0` - 最優先タスク
  - `1` - 2番目に優先
  - `50` - 51番目に優先
  - `200` - 201番目に優先
- **用途**:
  - Kanban board でのタスク表示順序
  - ユーザーは order 0 から順に消化
  - タスク数に応じて柔軟に増減
- **判定基準**:
  - タスクの緊急性・重要性
  - 依存関係（将来実装）
  - 工数とのバランス
- **ソート**: `tasks.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))`

#### logs

- **型**: `LogEntry[]`
- **詳細**: 後述の LogEntry 参照

#### deleted

- **型**: `boolean`
- **デフォルト**: `false`
- **用途**: 論理削除フラグ
- **動作**:
  - `true`: タスクは削除済み（通常のUI表示から除外）
  - `false`: タスクは有効（通常表示）
- **注意**: 論理削除されたタスクでも、worktreeとブランチは物理削除されます

#### deletedAt

- **型**: `string | undefined`
- **形式**: ISO 8601（例: `"2024-01-20T15:30:00.000Z"`）
- **設定**: タスク削除時（`deleted: true` 設定時）のみ
- **用途**: 削除日時の記録、削除済みタスクのソート・フィルタに使用

#### createdAt / updatedAt

- **型**: `string`
- **形式**: ISO 8601（例: `"2024-01-20T10:30:00.000Z"`）
- **生成**:
  - `createdAt`: タスク作成時
  - `updatedAt`: タスク更新時に自動更新

### タスクの制約

**重要**: Tsunagiでは以下の1対1対応が保証されます：

```
1 Task = 1 Worktree = 1 Branch
```

- 各タスクは必ず1つのブランチに紐付く
- 各ブランチは1つのworktreeに対応する
- 同じブランチを複数のタスクで共有することは**できない**

#### 論理削除の動作

**タスク削除時の挙動**:

- **タスクデータ**: 論理削除（`deleted: true`, `deletedAt` を設定）
- **Worktree**: 物理削除（`git worktree remove --force`）
- **ローカルブランチ**: 物理削除（`git branch -D`）
- **リモートブランチ**: 物理削除（`git push origin --delete`）

**理由**:

- タスクデータは検索・参照のために保持
- Worktree/ブランチはディスク容量節約のため物理削除
- 未コミットの変更がある場合でも強制削除
- ユーザーには削除前に確認ダイアログを表示

**UI表示**:

- Kanban board: `deleted: false` のタスクのみ表示
- 削除済みタスク: API経由で検索可能（`GET /api/tasks?includeDeleted=true`）

この制約により、タスクごとに完全に独立した作業環境が保証されます。

---

## ClaudeSession（Claudeセッション）

Claudeの実行セッションを表すエンティティです。1つのタスクに対して複数のセッションを持つことができます（1 task = n claude sessions）。

### 型定義

```typescript
interface ClaudeSession {
  // 識別子
  id: string; // UUID（例: "660e8400-e29b-41d4-a716-446655440001"）
  taskId: string; // 紐付くタスクID

  // セッション情報
  prompt: string; // Claudeへの指示
  status: ClaudeSessionStatus; // セッション状態

  // 許可プロンプト（waiting_for_permission時のみ）
  permissionPrompt?: {
    type: 'tool_use' | 'file_write' | 'bash_command'; // 操作タイプ
    description: string; // 操作の説明（例: "Edit src/auth/login.ts"）
    details: any; // 操作の詳細情報
  };

  // 実行結果
  result?: string; // 実行結果（完了時）
  error?: string; // エラーメッセージ（失敗時）

  // ログ
  logs: LogEntry[]; // 実行ログの配列

  // タイムスタンプ
  startedAt: string; // 開始日時（ISO 8601形式）
  completedAt?: string; // 完了日時（ISO 8601形式、完了時のみ）
  updatedAt: string; // 更新日時（ISO 8601形式）
}

type ClaudeSessionStatus =
  | 'running' // 実行中（メッセージ送信可能）
  | 'waiting_for_permission' // 許可待ち（ツール実行、ファイル操作など）
  | 'paused' // ユーザーが中断（ESC相当）
  | 'completed' // 完了
  | 'failed' // 失敗
  | 'cancelled'; // キャンセル
```

### フィールド詳細

#### id

- **型**: `string`
- **形式**: UUID v4
- **生成**: セッション作成時に自動生成

#### taskId

- **型**: `string`
- **必須**: ✓
- **説明**: このセッションが属するタスクのID
- **制約**: 参照先のTaskが存在する必要がある

#### prompt

- **型**: `string`
- **必須**: ✓
- **説明**: Claudeへの指示内容
- **例**: `"ログイン機能のテストコードを追加してください"`

#### status

- **型**: `ClaudeSessionStatus`
- **初期値**: `'running'`
- **状態遷移**:
  ```
  running → waiting_for_permission → running → completed
  running → paused → running → completed
  running → failed
  running → cancelled
  waiting_for_permission → running (許可)
  waiting_for_permission → failed (拒否/エラー)
  paused → running (再開)
  paused → cancelled
  ```

#### status詳細

**running（実行中）**

- Claudeが実行中
- **ユーザー操作可能**:
  - 追加メッセージ送信（途中で指示を追加）
  - 中断（ESC相当）
  - キャンセル
- UI: スピナー表示、実行中インジケーター、メッセージ入力フォーム表示

**waiting_for_permission（許可待ち）**

- ツール実行、ファイル書き込み、Bashコマンド実行などの許可を求めている
- `permissionPrompt` フィールドに操作の詳細が含まれる
- **ユーザーアクション必要**: 許可/拒否の選択
- UI: **ハイライト表示**、通知バッジ、許可プロンプト表示

**paused（中断中）**

- ユーザーが中断した状態（ESC相当）
- **ユーザー操作可能**:
  - 再開（追加メッセージと共に再開可能）
  - キャンセル
- UI: 中断アイコン、再開ボタン表示

**completed（完了）**

- セッション正常完了
- UI: 完了マーク、グレーアウト

**failed（失敗）**

- エラーで失敗
- UI: エラーアイコン、赤色表示

**cancelled（キャンセル）**

- ユーザーがキャンセルした
- UI: キャンセルアイコン、グレーアウト

#### logs

- **型**: `LogEntry[]`
- **説明**: セッションの実行ログ
- **リアルタイム更新**: WebSocketで随時追加

#### startedAt / completedAt / updatedAt

- **形式**: ISO 8601
- **タイムゾーン**: UTC
- **completedAt**: セッション完了時（completed/failed）のみ設定

### セッションのライフサイクル

```typescript
// 1. セッション作成
const session: ClaudeSession = {
  id: uuid(),
  taskId: '550e8400-...',
  prompt: 'ログイン機能を実装してください',
  status: 'running',
  logs: [],
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// 2. ユーザーが追加メッセージ送信（running中）
session.logs.push({
  timestamp: new Date().toISOString(),
  direction: 'send',
  content: 'TypeScriptで書いてください',
  type: 'user_message',
});

// 3. 実行中 → 許可待ち
session.status = 'waiting_for_permission';
session.permissionPrompt = {
  type: 'file_write',
  description: 'Edit src/auth/login.ts',
  details: {
    filePath: 'src/auth/login.ts',
    operation: 'write',
    preview: '... 変更内容のプレビュー ...',
  },
};

// 4. ユーザーが許可 → 再開
session.status = 'running';
session.permissionPrompt = undefined;

// 5. ユーザーが中断（ESC）
session.status = 'paused';

// 6. ユーザーが再開
session.status = 'running';

// 7. 完了
session.status = 'completed';
session.completedAt = new Date().toISOString();
session.result = 'ログイン機能を実装しました';
```

### UI表示要件

**常時表示エリア（サイドバー or フローティングパネル）**:

- アクティブセッション一覧
- 各セッション:
  - タスク名
  - セッション状態（アイコン + ステータステキスト）
  - 経過時間
  - **waiting_for_permission はハイライト表示**（ユーザーアクション必要）

**クリック時の動作**:

- タスク詳細パネルを開く
- セッションのログをリアルタイム表示
- `running`: メッセージ入力フォーム + 中断ボタン表示
- `waiting_for_permission`: 許可/拒否ボタン表示
- `paused`: 再開ボタン表示

### データ永続化

**保存場所**: `~/.tsunagi/claude-sessions.json`

```json
{
  "version": "1.0",
  "sessions": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "taskId": "550e8400-e29b-41d4-a716-446655440000",
      "prompt": "ログイン機能を実装してください",
      "status": "completed",
      "result": "実装完了しました",
      "logs": [...],
      "startedAt": "2024-01-20T10:00:00.000Z",
      "completedAt": "2024-01-20T10:30:00.000Z",
      "updatedAt": "2024-01-20T10:30:00.000Z"
    }
  ]
}
```

**保持期間**:

- アクティブセッション（running/waiting_for_permission/paused）: 永続保持
- 完了セッション（completed/failed/cancelled）: 7日間保持後、自動削除（オプション）

---

## Repository（リポジトリ）

GitHubリポジトリの情報を管理するエンティティです。

### 型定義

```typescript
interface Repository {
  // 識別子
  id: string; // UUID

  // Git情報
  owner: string; // GitHub owner
  repo: string; // GitHub repository名
  cloneUrl: string; // Clone URL（HTTPS/SSH）

  // 認証
  authToken?: string; // GitHub Personal Access Token（オプション）

  // ローカル情報
  bareRepoPath: string; // bare repositoryのローカルパス

  // タイムスタンプ
  createdAt: string; // 登録日時（ISO 8601形式）
}
```

### フィールド詳細

#### id

- **型**: `string`
- **形式**: UUID v4
- **生成**: リポジトリ登録時に自動生成

#### owner / repo

- **型**: `string`
- **例**:
  - `owner: "minimalcorp"`
  - `repo: "tsunagi"`

#### cloneUrl

- **型**: `string`
- **形式**: HTTPS または SSH
- **例**:
  - `"https://github.com/minimalcorp/tsunagi.git"`
  - `"git@github.com:minimalcorp/tsunagi.git"`

#### authToken

- **型**: `string | undefined`
- **用途**: プライベートリポジトリのクローン時に使用
- **セキュリティ**: MVP時点では平文保存、将来は暗号化を検討

#### bareRepoPath

- **型**: `string`
- **形式**: 絶対パス
- **例**: `"/Users/username/tsunagi/minimalcorp/tsunagi"`
- **生成**: `~/.tsunagi/workspaces/{owner}/{repo}` として自動決定

#### createdAt

- **型**: `string`
- **形式**: ISO 8601

---

## LogEntry（ログエントリ）

Claude実行時のログを記録するエンティティです。

### 型定義

```typescript
interface LogEntry {
  // タイムスタンプ
  timestamp: string; // ISO 8601形式

  // 方向
  direction: 'send' | 'receive'; // 送信/受信

  // 内容
  content: string; // ログ内容

  // タイプ
  type?: 'info' | 'error' | 'tool_use'; // ログタイプ（オプション）
}
```

### フィールド詳細

#### timestamp

- **型**: `string`
- **形式**: ISO 8601
- **例**: `"2024-01-20T10:30:15.123Z"`

#### direction

- **型**: `'send' | 'receive'`
- **意味**:
  - `send`: ユーザー → Claude
  - `receive`: Claude → ユーザー

#### content

- **型**: `string`
- **例**:
  - `"ログイン機能を実装してください"`（send）
  - `"実装を開始します。まずは認証ロジックを作成します。"`（receive）
  - `"[Tool: Edit] src/auth/login.ts を編集"`（receive, type: 'tool_use'）

#### type

- **型**: `'info' | 'error' | 'tool_use' | undefined`
- **用途**: ログの種類を分類
- **例**:
  - `info`: 通常のメッセージ
  - `error`: エラーメッセージ
  - `tool_use`: Tool使用ログ

---

## Worktree（Worktree情報）

Git worktreeの状態を表すエンティティです（APIレスポンス用）。

### 型定義

```typescript
interface Worktree {
  // Git情報
  owner: string; // GitHub owner
  repo: string; // リポジトリ名
  branch: string; // ブランチ名

  // ローカル情報
  path: string; // worktreeのパス

  // 状態
  exists: boolean; // worktreeが存在するか

  // タイムスタンプ
  createdAt?: string; // 作成日時（ファイルシステムから取得）
}
```

### フィールド詳細

#### owner / repo / branch

- **型**: `string`
- **例**:
  - `owner: "minimalcorp"`
  - `repo: "tsunagi"`
  - `branch: "feat/auth"`

#### path

- **型**: `string`
- **形式**: 絶対パス
- **例**: `"/Users/username/tsunagi/minimalcorp/tsunagi/feat/auth"`

#### exists

- **型**: `boolean`
- **用途**: worktreeが実際に存在するかを確認

#### createdAt

- **型**: `string | undefined`
- **形式**: ISO 8601
- **取得**: ディレクトリの作成日時から取得

---

## EnvironmentVariable（環境変数）

環境変数を管理するエンティティです。グローバル、owner単位、repo単位で設定可能です。

### 型定義

```typescript
interface EnvironmentVariable {
  key: string; // 環境変数名（例: "API_KEY"）
  value: string; // 環境変数値
  scope: 'global' | 'owner' | 'repo'; // スコープ
  owner?: string; // owner単位の場合に指定
  repo?: string; // repo単位の場合に指定
}
```

### フィールド詳細

#### key

- **型**: `string`
- **制約**: 1〜255文字、英数字とアンダースコア
- **例**: `"ANTHROPIC_API_KEY"`, `"DATABASE_URL"`

#### value

- **型**: `string`
- **制約**: 0〜10000文字
- **例**: `"sk-ant-xxx"`, `"postgresql://localhost:5432/db"`

#### scope

- **型**: `'global' | 'owner' | 'repo'`
- **意味**:
  - `global`: 全リポジトリに適用
  - `owner`: 特定owner配下の全リポジトリに適用
  - `repo`: 特定リポジトリにのみ適用
- **優先順位**: `repo` > `owner` > `global`

#### owner

- **型**: `string | undefined`
- **必須**: `scope === 'owner' | 'repo'` の場合
- **例**: `"minimalcorp"`

#### repo

- **型**: `string | undefined`
- **必須**: `scope === 'repo'` の場合
- **例**: `"tsunagi"`

### 環境変数の適用

環境変数は以下の場面で自動的に読み込まれます：

- **Terminal起動時**: プロセスの環境変数として設定
- **VSCode起動時**: `.vscode/settings.json` に設定
- **Claude実行時**: プロセスの環境変数として設定

詳細は [@docs/environment-variables.md](./environment-variables.md) を参照。

---

## WebSocketイベント（Phase 5）

WebSocketで送信されるイベントの型定義です。

### 型定義

```typescript
// イベント種別
type WSEventType =
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'claude:started'
  | 'claude:completed'
  | 'claude:log';

// イベントペイロード
interface WSEvent {
  type: WSEventType;
  timestamp: string; // ISO 8601
  data: {
    taskId?: string; // タスクID
    task?: Task; // タスクオブジェクト
    log?: LogEntry; // ログエントリ
  };
}
```

### イベント詳細

#### task:created

- **用途**: 新規タスク作成時
- **data**: `{ task: Task }`

#### task:updated

- **用途**: タスク更新時
- **data**: `{ task: Task }`

#### task:deleted

- **用途**: タスク削除時
- **data**: `{ taskId: string }`

#### claude:started

- **用途**: Claude実行開始時
- **data**: `{ taskId: string }`

#### claude:completed

- **用途**: Claude実行完了時
- **data**: `{ taskId: string, task: Task }`

#### claude:log

- **用途**: ログ追加時
- **data**: `{ taskId: string, log: LogEntry }`

---

## データバリデーション

### タスク作成時

- `title`: 必須、1〜200文字
- `description`: オプション、0〜5000文字
- `owner`: 必須、1〜39文字、正規表現: `/^[a-zA-Z0-9-]+$/`
- `repo`: 必須、1〜100文字
- `branch`: 必須、1〜255文字

### リポジトリ登録時

- `owner`: 必須
- `repo`: 必須
- `cloneUrl`: 必須、URL形式

### ログ追加時

- `content`: 必須
- `direction`: 必須、`'send' | 'receive'`

---

## データ制約

### 一意性制約

- **Task.id**: 全タスク内で一意
- **Repository.id**: 全リポジトリ内で一意
- **Repository (owner + repo)**: 組み合わせが一意

### 外部キー制約（論理的）

- **Task → Repository**: `(Task.owner, Task.repo)` は `Repository` に存在する必要あり（推奨）
  - MVPでは強制しない

---

## インデックス（将来のDB移行時）

### Task

- `id` (Primary Key)
- `owner, repo` (Composite Index)
- `status` (Index)
- `claudeState` (Index)

### Repository

- `id` (Primary Key)
- `owner, repo` (Unique Composite Index)

---

## データマイグレーション

現時点ではJSONファイルベースのため、スキーマ変更時は以下の対応を検討：

1. **後方互換性**: 新フィールドはオプショナルに
2. **マイグレーションスクリプト**: 既存データを変換
3. **バージョニング**: データ形式のバージョンを記録

---

## サンプルデータ

### Task例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "ログイン機能の実装",
  "description": "JWT認証を使用したログイン機能を実装する",
  "status": "coding",
  "owner": "minimalcorp",
  "repo": "tsunagi",
  "branch": "feat/auth",
  "claudeState": "running",
  "prompt": "JWT認証を使用したログイン機能を実装してください",
  "logs": [
    {
      "timestamp": "2024-01-20T10:30:00.000Z",
      "direction": "send",
      "content": "JWT認証を使用したログイン機能を実装してください",
      "type": "info"
    },
    {
      "timestamp": "2024-01-20T10:30:05.000Z",
      "direction": "receive",
      "content": "実装を開始します",
      "type": "info"
    }
  ],
  "deleted": false,
  "createdAt": "2024-01-20T10:00:00.000Z",
  "updatedAt": "2024-01-20T10:30:00.000Z"
}
```

### Repository例

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "owner": "minimalcorp",
  "repo": "tsunagi",
  "cloneUrl": "https://github.com/minimalcorp/tsunagi.git",
  "bareRepoPath": "/Users/username/tsunagi/minimalcorp/tsunagi",
  "createdAt": "2024-01-15T09:00:00.000Z"
}
```
