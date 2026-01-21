# 実装計画

TsunagiのMVP実装計画について説明します。4つのフェーズに分けて段階的に実装します。

---

## 実装フェーズ概要

| フェーズ | 内容                      | 期間  | 優先度 |
| -------- | ------------------------- | ----- | ------ |
| Phase 1  | データモデル・基盤        | 1-2日 | 最高   |
| Phase 2  | Kanban UI                 | 2-3日 | 最高   |
| Phase 3  | Git Worktree管理          | 2-3日 | 高     |
| Phase 4  | Claude Agent基本統合      | 2-3日 | 高     |
| Phase 5  | WebSocketリアルタイム更新 | 1-2日 | 中     |
| Phase 6  | 外部ツール統合            | 1日   | 低     |

**MVP範囲**: Phase 1-4（合計 8-11日）

---

## Phase 1: データモデル・基盤

### 目標

タスク・リポジトリのデータモデルを実装し、JSON永続化とREST APIを提供する。

### タスク

#### 1.1 依存関係のインストール

```bash
npm install simple-git @anthropic-ai/sdk @hello-pangea/dnd
```

#### 1.2 型定義の実装

**ファイル**: `src/lib/types.ts`

- [ ] Task型の定義
- [ ] Repository型の定義
- [ ] LogEntry型の定義
- [ ] Worktree型の定義
- [ ] API Request/Response型の定義

#### 1.3 Task Manager実装

**ファイル**: `src/lib/task-manager.ts`

- [ ] `loadTasks()` - タスク読み込み
- [ ] `saveTasks()` - タスク保存
- [ ] `getTasks()` - タスク一覧取得（フィルター対応）
- [ ] `getTask(id)` - タスク取得
- [ ] `createTask()` - タスク作成
- [ ] `updateTask(id, updates)` - タスク更新
- [ ] `deleteTask(id)` - タスク削除
- [ ] 原子的書き込み実装
- [ ] エラーハンドリング

#### 1.4 Repository Manager実装

**ファイル**: `src/lib/repo-manager.ts`

- [ ] `loadRepos()` - リポジトリ読み込み
- [ ] `saveRepos()` - リポジトリ保存
- [ ] `getRepos()` - リポジトリ一覧取得
- [ ] `getRepo(id)` - リポジトリ取得
- [ ] `createRepo()` - リポジトリ作成
- [ ] `updateRepo(id, updates)` - リポジトリ更新
- [ ] `deleteRepo(id)` - リポジトリ削除

#### 1.5 Tasks API実装

**ファイル**: `src/app/api/tasks/route.ts`

- [ ] `GET /api/tasks` - タスク一覧取得
- [ ] `POST /api/tasks` - タスク作成

**ファイル**: `src/app/api/tasks/[id]/route.ts`

- [ ] `GET /api/tasks/[id]` - タスク取得
- [ ] `PUT /api/tasks/[id]` - タスク更新
- [ ] `DELETE /api/tasks/[id]` - タスク削除

#### 1.6 Repositories API実装

**ファイル**: `src/app/api/repos/route.ts`

- [ ] `GET /api/repos` - リポジトリ一覧取得
- [ ] `POST /api/repos` - リポジトリ作成

**ファイル**: `src/app/api/repos/[id]/route.ts`

- [ ] `GET /api/repos/[id]` - リポジトリ取得
- [ ] `PUT /api/repos/[id]` - リポジトリ更新
- [ ] `DELETE /api/repos/[id]` - リポジトリ削除

#### 1.7 テスト

- [ ] タスクCRUDのテスト
- [ ] リポジトリCRUDのテスト
- [ ] JSONファイル永続化のテスト

### 完了条件

- [ ] タスク・リポジトリのCRUD操作が動作する
- [ ] JSONファイルが正しく永続化される
- [ ] APIエンドポイントが正しくレスポンスを返す

---

## Phase 2: Kanban UI

### 目標

Kanban boardを実装し、タスクの視覚的管理を可能にする。

### タスク

#### 2.1 コンポーネント実装

**ファイル**: `src/components/KanbanBoard.tsx`

- [ ] 基本レイアウト
- [ ] DragDropContext実装
- [ ] onDragEnd ハンドラー
- [ ] タスクフィルター・検索機能

**ファイル**: `src/components/KanbanColumn.tsx`

- [ ] Droppableコンポーネント
- [ ] カラムヘッダー（タイトル、件数）
- [ ] タスクリスト表示
- [ ] ドラッグ中のスタイル

**ファイル**: `src/components/TaskCard.tsx`

- [ ] Draggableコンポーネント
- [ ] タスク情報表示（title, owner/repo/branch）
- [ ] Claude実行状態アイコン
- [ ] ホバー・ドラッグ時のスタイル

**ファイル**: `src/components/TaskFilter.tsx`

- [ ] Ownerフィルター
- [ ] Repoフィルター
- [ ] 検索ボックス
- [ ] フィルターリセット

**ファイル**: `src/components/AddTaskDialog.tsx`

- [ ] モーダルレイアウト
- [ ] フォーム実装
- [ ] バリデーション
- [ ] submitハンドラー

**ファイル**: `src/components/TaskDetail.tsx`

- [ ] サイドパネルレイアウト
- [ ] Task Information表示・編集
- [ ] Claude Prompt入力
- [ ] Execution Logs表示
- [ ] Actions（削除など）

#### 2.2 メインページ刷新

**ファイル**: `src/app/page.tsx`

- [ ] 既存コードを削除
- [ ] KanbanBoardコンポーネントを統合
- [ ] タスク一覧取得
- [ ] タスク作成・更新・削除ハンドラー
- [ ] フィルター・検索状態管理

#### 2.3 スタイリング

- [ ] Tailwind CSSでレスポンシブ対応
- [ ] ドラッグ&ドロップのアニメーション
- [ ] ホバー・フォーカススタイル

#### 2.4 テスト

- [ ] タスクカードの表示テスト
- [ ] ドラッグ&ドロップ動作テスト
- [ ] フィルター・検索機能テスト

### 完了条件

- [ ] Kanban boardが正しく表示される
- [ ] ドラッグ&ドロップでタスクステータスを変更できる
- [ ] タスクのフィルター・検索が動作する
- [ ] タスクの作成・編集・削除が動作する

---

## Phase 3: Git Worktree管理

### 目標

Git worktreeの自動管理を実装し、タスクごとに独立した作業環境を提供する。

### タスク

#### 3.1 Worktree Manager実装

**ファイル**: `src/lib/worktree-manager.ts`

- [ ] `normalizeBranchName()` - ブランチ名正規化
- [ ] `initBareRepository()` - bare repository初期化
- [ ] `createWorktree()` - worktree作成
- [ ] `removeWorktree()` - worktree削除
- [ ] `listWorktrees()` - worktree一覧取得
- [ ] `ensureBareRepository()` - bare repository存在確認
- [ ] エラーハンドリング

#### 3.2 Worktrees API実装

**ファイル**: `src/app/api/worktrees/init/route.ts`

- [ ] `POST /api/worktrees/init` - bare repository初期化

**ファイル**: `src/app/api/worktrees/create/route.ts`

- [ ] `POST /api/worktrees/create` - worktree作成

**ファイル**: `src/app/api/worktrees/delete/route.ts`

- [ ] `DELETE /api/worktrees/delete` - worktree削除

**ファイル**: `src/app/api/worktrees/list/route.ts`

- [ ] `GET /api/worktrees/list` - worktree一覧取得

#### 3.3 タスク作成時のworktree自動生成

**ファイル**: `src/lib/task-manager.ts`

- [ ] `createTaskWithWorktree()` 実装
- [ ] タスク作成API統合

#### 3.4 リポジトリ設定UI

**ファイル**: `src/components/RepoSettings.tsx`（新規）

- [ ] リポジトリ一覧表示
- [ ] リポジトリ追加フォーム
- [ ] リポジトリ削除

**ファイル**: `src/app/page.tsx`

- [ ] 設定ボタンの追加
- [ ] RepoSettings統合

#### 3.5 テスト

- [ ] bare repository初期化テスト
- [ ] worktree作成・削除テスト
- [ ] タスク作成時のworktree自動生成テスト

### 完了条件

- [ ] bare repositoryを初期化できる
- [ ] worktreeを作成・削除できる
- [ ] タスク作成時に自動でworktreeが作成される
- [ ] `~/.tsunagi/workspaces/{owner}/{repo}/{branch}/` 構造が正しく作成される

---

## Phase 4: Claude Agent基本統合

### 目標

Claude APIを統合し、タスクに対してプロンプトを実行できるようにする。

### タスク

#### 4.1 Claude Client実装

**ファイル**: `src/lib/claude-client.ts`

- [ ] Anthropic SDK初期化
- [ ] `executePrompt()` - プロンプト実行
- [ ] ストリーミングレスポンス処理
- [ ] ログ記録
- [ ] エラーハンドリング

#### 4.2 Claude API実装

**ファイル**: `src/app/api/claude/execute/route.ts`

- [ ] `POST /api/claude/execute` - プロンプト実行開始
- [ ] タスクステータス更新（`claudeState: 'running'`）

**ファイル**: `src/app/api/claude/stream/route.ts`

- [ ] `GET /api/claude/stream` - SSEストリーミング
- [ ] ログイベントの送信
- [ ] 完了イベントの送信

**ファイル**: `src/app/api/claude/stop/route.ts`

- [ ] `POST /api/claude/stop` - 実行停止

#### 4.3 TaskDetailでのClaude実行

**ファイル**: `src/components/TaskDetail.tsx`

- [ ] Claude Prompt入力UI
- [ ] Execute/Stopボタン
- [ ] SSEストリーミング受信
- [ ] ログのリアルタイム表示

#### 4.4 LogViewer再利用

**ファイル**: `src/components/LogViewer.tsx`

- [ ] 既存のLogViewerを調整
- [ ] ログエントリ表示
- [ ] 自動スクロール

#### 4.5 環境変数設定

**ファイル**: `.env.local`

```
ANTHROPIC_API_KEY=your-api-key-here
```

#### 4.6 テスト

- [ ] Claude実行のテスト
- [ ] ストリーミングログ受信テスト
- [ ] 実行停止テスト

### 完了条件

- [ ] Claudeにプロンプトを送信できる
- [ ] ストリーミングレスポンスをリアルタイム表示できる
- [ ] ログがタスクに保存される
- [ ] 実行を停止できる

---

## Phase 5: WebSocketリアルタイム更新（将来）

### 目標

WebSocketを導入し、タスク状態の変更を全クライアントにリアルタイム通知する。

### タスク

#### 5.1 Socket.IOインストール

```bash
npm install socket.io socket.io-client
```

#### 5.2 WebSocket Server実装

**ファイル**: `src/app/api/ws/route.ts`

- [ ] Socket.IO サーバー初期化
- [ ] イベントハンドラー（subscribe, unsubscribe）
- [ ] ブロードキャスト機能

#### 5.3 イベント送信

- [ ] タスク作成時: `task:created`
- [ ] タスク更新時: `task:updated`
- [ ] タスク削除時: `task:deleted`
- [ ] Claude開始時: `claude:started`
- [ ] Claude完了時: `claude:completed`
- [ ] ログ追加時: `claude:log`

#### 5.4 クライアント統合

**ファイル**: `src/app/page.tsx`

- [ ] Socket.IO クライアント接続
- [ ] イベントリスナー登録
- [ ] タスク状態の自動更新

### 完了条件

- [ ] WebSocket接続が確立される
- [ ] タスク変更が全クライアントに通知される
- [ ] 自動再接続が動作する

---

## Phase 6: 外部ツール統合（将来）

### 目標

Terminal/VSCodeの起動機能を追加する。

### タスク

#### 6.1 Terminal/VSCode API実装

**ファイル**: `src/app/api/terminal/open/route.ts`

- [ ] `POST /api/terminal/open` - Terminal起動
- [ ] OS別コマンド対応（macOS, Linux, Windows）

**ファイル**: `src/app/api/vscode/open/route.ts`

- [ ] `POST /api/vscode/open` - VSCode起動

#### 6.2 TaskDetail統合

**ファイル**: `src/components/TaskDetail.tsx`

- [ ] "Open Terminal" ボタン
- [ ] "Open VSCode" ボタン

### 完了条件

- [ ] TaskDetailからTerminalを起動できる
- [ ] TaskDetailからVSCodeを起動できる
- [ ] worktreeディレクトリで正しく開かれる

---

## 既存コードのクリーンアップ

### 削除対象

- [ ] `.solo/` ディレクトリ（もし存在すれば）
- [ ] `src/lib/node-manager.ts`
- [ ] `src/lib/claude-cli.ts`
- [ ] `src/components/NodeGraph.tsx`
- [ ] `src/components/NodeDetail.tsx`（既存のもの）
- [ ] `src/components/AddNodeDialog.tsx`（既存のもの）
- [ ] `src/app/api/nodes/` 配下の全API Routes

### 保持対象

- [ ] `src/components/LogViewer.tsx` - 再利用
- [ ] プロジェクト設定ファイル（package.json, tsconfig.json, etc.）

---

## マイルストーン

### M1: Phase 1完了（2日目）

- データモデル・API実装完了
- タスク・リポジトリのCRUD操作が動作

### M2: Phase 2完了（5日目）

- Kanban UI実装完了
- タスクの視覚的管理が可能

### M3: Phase 3完了（8日目）

- Git worktree管理実装完了
- タスクごとに独立した作業環境が構築される

### M4: MVP完成（11日目）

- Phase 4完了
- Claudeの実行・ログ表示が動作
- MVP全機能が揃う

---

## リスク管理

### リスク1: Git worktree操作の複雑さ

- **対策**: simple-gitの詳細なテスト、エラーハンドリングの徹底

### リスク2: Claude API統合の難しさ

- **対策**: Anthropic SDKの公式ドキュメントを熟読、段階的実装

### リスク3: スケジュールの遅延

- **対策**: Phase 5, 6は将来実装として切り離し、MVPに集中

---

## 次のステップ

1. **依存関係のインストール**

   ```bash
   npm install simple-git @anthropic-ai/sdk @hello-pangea/dnd
   ```

2. **既存コードのバックアップ**

   ```bash
   git checkout -b backup/old-implementation
   git checkout main
   ```

3. **Phase 1の実装開始**
   - `src/lib/types.ts` の実装から開始
   - Task/Repo Managerの実装
   - API Routesの実装

---

## 完了チェックリスト

### MVP完了条件

- [ ] タスクをKanban boardで管理できる
- [ ] タスクをドラッグ&ドロップで移動できる
- [ ] タスクをフィルター・検索できる
- [ ] リポジトリを登録できる
- [ ] タスク作成時にworktreeが自動生成される
- [ ] TaskDetailからClaudeにプロンプトを実行できる
- [ ] Claude実行ログがリアルタイム表示される
- [ ] タスクを削除できる
- [ ] `~/.tsunagi/state/tasks.json` にデータが永続化される
- [ ] `~/.tsunagi/workspaces/{owner}/{repo}/{branch}/` 構造が正しく作成される

---

以上でMVP実装計画の全容です。Phase 1から順番に実装を進めましょう！
