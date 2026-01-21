# アーキテクチャ

Tsunagiのアーキテクチャ、技術スタック、ディレクトリ構造について説明します。

---

## 技術スタック

### フロントエンド

#### コアフレームワーク

- **Next.js 16** - Reactベースのフルスタックフレームワーク
- **React 19** - UIライブラリ
- **TypeScript 5** - 型安全性

#### UIライブラリ

- **Tailwind CSS v4** - ユーティリティファーストCSS
- **@ark-ui/react** - ヘッドレスUIコンポーネント（45+コンポーネント）
  - Dialog, Select, Tabs, DatePicker, Toast, Tooltip など
  - ステートマシンベース、Tailwind CSS公式サポート
- **@monaco-editor/react** - プロンプト入力用コードエディタ
- **@hello-pangea/dnd** - ドラッグ&ドロップ機能（Kanban用）

### バックエンド

#### サーバーサイド

- **Next.js API Routes** - RESTful API
- **WebSocket (Socket.IO)** - リアルタイム通信（Phase 5）
- **Node.js fs/promises** - ファイルシステム操作

#### 外部ライブラリ

- **simple-git** - Git操作（worktree管理）
- **@anthropic-ai/sdk** - Claude API統合

### データ管理

#### 永続化

- **ファイルベース（JSON）** - 設定・タスクデータ
  - `~/.tsunagi/state/tasks.json` - タスクデータ
  - `~/.tsunagi/state/repos.json` - リポジトリ設定
  - `~/.tsunagi/state/sessions.json` - Claude Sessions

#### ソースコード管理

- **Git Worktrees** - ブランチごとの作業環境
  - `~/.tsunagi/workspaces/{owner}/{repo}/` - bare repository
  - `~/.tsunagi/workspaces/{owner}/{repo}/{branch}/` - worktree

### 開発ツール

- **ESLint** - コード品質チェック
- **Prettier** - コードフォーマット
- **Husky** - Git hooks
- **lint-staged** - ステージングされたファイルのリント

---

## 技術選定の背景

### Ark UI採用理由

Tsunagiでは、ヘッドレスUIライブラリとして**Ark UI**を採用しました。

#### 選定プロセス

候補として以下を検討：

- **Headless UI** (Tailwind Labs公式) - シンプルだが、コンポーネント数が少ない（16個）
- **Radix UI** - 豊富なコンポーネント（32+）だが、DatePickerなし
- **React Aria** (Adobe) - アクセシビリティ最強だが、学習コストが高い
- **Ark UI** (Chakra UI team) - 45+コンポーネント、すべて揃っている

#### Ark UI を選択した理由

1. ✅ **必要なコンポーネントが全て揃っている**
   - DatePicker（タスク期限設定）
   - Toast/Notification（成功/エラーメッセージ）
   - Tooltip（ヒント表示）
   - Dialog, Select, Tabs など基本コンポーネント

2. ✅ **ライブラリ数の最小化**
   - Headless UIの場合: Headless UI + react-day-picker + sonner + Radix Tooltip（4-5個）
   - Ark UIの場合: Ark UI + @hello-pangea/dnd（2個のみ）

3. ✅ **Tailwind CSS公式サポート**
   - [公式スタイリングガイド](https://ark-ui.com/docs/guides/styling)でTailwind使用方法を説明
   - `data-*`属性によるステート管理でTailwindバリアント対応

4. ✅ **ステートマシンベースの堅牢性**
   - Zag.js（Finite State Machines）ベース
   - 予測可能な動作、バグが少ない

5. ✅ **マルチフレームワーク対応**
   - React, Vue, Solid, Svelteに対応
   - 将来的なフレームワーク移行の可能性に備える

6. ✅ **LLM統合の方針**
   - Ark UIはLLM統合を見据えた設計
   - Claudeとの親和性が高い

#### トレードオフ

- ⚠️ **学習コスト**: Headless UIよりやや高い
- ⚠️ **Tailwind統合**: Headless UIほどシームレスではない（公式サポートはあるが、手間がかかる）
- ✅ **メリット**: コンポーネント数と機能性が上回り、長期的なメンテナンス性が向上

---

## システムアーキテクチャ

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          React UI (Next.js App Router)               │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │  Kanban    │  │ Task Detail  │  │   Filters   │  │   │
│  │  │   Board    │  │    Panel     │  │             │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │   │
│  │         ▲                 ▲                ▲          │   │
│  │         │    REST API     │                │          │   │
│  │         │    WebSocket    │                │          │   │
│  └─────────┼─────────────────┼────────────────┼─────────┘   │
└────────────┼─────────────────┼────────────────┼─────────────┘
             │                 │                │
             ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Server (Local)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API Routes (/api/*)                     │   │
│  │  ┌────────┐ ┌──────────┐ ┌───────────┐ ┌─────────┐  │   │
│  │  │ Tasks  │ │  Repos   │ │ Worktrees │ │ Claude  │  │   │
│  │  │  CRUD  │ │   CRUD   │ │   Mgmt    │ │  Exec   │  │   │
│  │  └────────┘ └──────────┘ └───────────┘ └─────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Business Logic Layer (lib/)                 │   │
│  │  ┌──────────────┐ ┌────────────────┐ ┌────────────┐  │   │
│  │  │Task Manager  │ │ Repo Manager   │ │  Worktree  │  │   │
│  │  │              │ │                │ │  Manager   │  │   │
│  │  └──────────────┘ └────────────────┘ └────────────┘  │   │
│  │  ┌──────────────────────────────────────────────────┐  │
│  │  │         Claude Client (simple-git)               │  │
│  │  └──────────────────────────────────────────────────┘  │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │         │
                          ▼         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Local File System                          │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  ~/.tsunagi/                                         │    │
│  │  ├─ state/                                           │    │
│  │  │  ├─ tasks.json                                    │    │
│  │  │  ├─ repos.json                                    │    │
│  │  │  └─ sessions.json                                 │    │
│  │  └─ workspaces/                                      │    │
│  │     └── {owner}/                                     │    │
│  │         └── {repo}/                                  │    │
│  │             ├── .git/ (bare)                         │    │
│  │             ├── main/                                │    │
│  │             └── {branch}/                            │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  Anthropic API   │
                 │  (Claude)        │
                 └──────────────────┘
```

---

## ディレクトリ構造

### プロジェクトディレクトリ

```
tsunagi/
├── @docs/                      # プロジェクトドキュメント
│   ├── overview.md
│   ├── architecture.md
│   ├── data-models.md
│   ├── local-data.md
│   ├── api-specification.md
│   ├── git-worktree.md
│   ├── implementation-plan.md
│   └── pages/
│       ├── kanban.md
│       └── task-detail.md
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API Routes
│   │   │   ├── tasks/          # タスクCRUD
│   │   │   │   ├── route.ts           # GET, POST /api/tasks
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts       # GET, PUT, DELETE /api/tasks/[id]
│   │   │   │
│   │   │   ├── repos/          # リポジトリ管理
│   │   │   │   ├── route.ts           # GET, POST /api/repos
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts       # GET, PUT, DELETE /api/repos/[id]
│   │   │   │
│   │   │   ├── worktrees/      # Git worktree操作
│   │   │   │   ├── init/
│   │   │   │   │   └── route.ts       # POST /api/worktrees/init
│   │   │   │   ├── create/
│   │   │   │   │   └── route.ts       # POST /api/worktrees/create
│   │   │   │   ├── delete/
│   │   │   │   │   └── route.ts       # DELETE /api/worktrees/delete
│   │   │   │   └── list/
│   │   │   │       └── route.ts       # GET /api/worktrees/list
│   │   │   │
│   │   │   ├── claude/         # Claude実行
│   │   │   │   ├── execute/
│   │   │   │   │   └── route.ts       # POST /api/claude/execute
│   │   │   │   ├── stream/
│   │   │   │   │   └── route.ts       # GET /api/claude/stream (SSE)
│   │   │   │   └── stop/
│   │   │   │       └── route.ts       # POST /api/claude/stop
│   │   │   │
│   │   │   ├── terminal/       # Terminal起動（Phase 6）
│   │   │   │   └── open/
│   │   │   │       └── route.ts       # POST /api/terminal/open
│   │   │   │
│   │   │   ├── vscode/         # VSCode起動（Phase 6）
│   │   │   │   └── open/
│   │   │   │       └── route.ts       # POST /api/vscode/open
│   │   │   │
│   │   │   └── ws/             # WebSocket（Phase 5）
│   │   │       └── route.ts           # WebSocket connection
│   │   │
│   │   ├── page.tsx            # メインページ（Kanban UI）
│   │   ├── layout.tsx          # ルートレイアウト
│   │   ├── globals.css         # グローバルスタイル
│   │   └── favicon.ico
│   │
│   ├── components/             # Reactコンポーネント
│   │   ├── KanbanBoard.tsx     # Kanban boardメインコンポーネント
│   │   ├── KanbanColumn.tsx    # Kanbanカラム（Todo/In Progress/Done）
│   │   ├── TaskCard.tsx        # タスクカード
│   │   ├── TaskDetail.tsx      # タスク詳細パネル
│   │   ├── TaskFilter.tsx      # タスクフィルター
│   │   ├── AddTaskDialog.tsx   # タスク作成ダイアログ
│   │   └── LogViewer.tsx       # ログ表示（既存）
│   │
│   └── lib/                    # ビジネスロジック・ユーティリティ
│       ├── types.ts            # 型定義
│       ├── task-manager.ts     # タスク管理ロジック
│       ├── repo-manager.ts     # リポジトリ管理ロジック
│       ├── worktree-manager.ts # Git worktree管理
│       └── claude-client.ts    # Claude統合
│
├── .env.local                  # 環境変数（ANTHROPIC_API_KEY）
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── eslint.config.mjs
├── .prettierrc.json
└── README.md
```

### ローカルデータディレクトリ

```
~/.tsunagi/                      # 設定・データディレクトリ
├── state/                       # 永続化データ
│   ├── tasks.json               # タスクデータ
│   ├── repos.json               # リポジトリ設定
│   └── sessions.json            # Claude Sessions
└── workspaces/                  # Git Worktrees
    └── {owner}/                 # GitHub organization/user
        └── {repo}/              # リポジトリ名
            ├── .git/            # bare repository
            ├── main/            # mainブランチのworktree
            └── {branch}/        # 各ブランチのworktree
```

---

## データフロー

### タスク作成フロー

```
User Input (UI)
  │
  ▼
AddTaskDialog
  │ (タスク情報)
  ▼
POST /api/tasks
  │
  ▼
Task Manager
  ├─► ~/.tsunagi/state/tasks.json に保存
  │
  └─► POST /api/worktrees/create
      │
      ▼
    Worktree Manager
      ├─► bare repositoryチェック（なければ初期化）
      └─► git worktree add
          │
          ▼
        ~/.tsunagi/workspaces/{owner}/{repo}/{branch}/ 作成
```

### Claude実行フロー

```
User Input (TaskDetail)
  │ (プロンプト)
  ▼
POST /api/claude/execute
  │
  ▼
Claude Client
  ├─► Task Manager: status → 'running'
  ├─► Anthropic API にリクエスト
  │
  └─► GET /api/claude/stream (SSE)
      │
      ▼
    ストリーミングレスポンス
      │
      ├─► LogEntry 追加
      ├─► UI リアルタイム更新
      │
      └─► 完了時: Task Manager: status → 'idle'
```

### タスクステータス更新フロー

```
User Drag & Drop (Kanban)
  │
  ▼
KanbanBoard
  │ (新しいステータス)
  ▼
PUT /api/tasks/[id]
  │
  ▼
Task Manager
  └─► tasks.json 更新
      │
      └─► WebSocket broadcast (Phase 5)
          │
          ▼
        全クライアントに通知
```

---

## セキュリティ考慮事項

### 認証・認可

- **MVP範囲**: ローカル環境のみで動作、認証不要
- **将来**: 複数ユーザー対応時に認証機能を追加

### API Key管理

- **ANTHROPIC_API_KEY**: `.env.local` で管理
- **Git認証**: `~/.tsunagi/state/repos.json` に暗号化せず保存（MVP）
  - 将来的には暗号化を検討

### ファイルシステムアクセス

- **制限**: `~/.tsunagi/` 以下のみアクセス
- **検証**: パストラバーサル攻撃の防止

---

## パフォーマンス最適化

### フロントエンド

- **コード分割**: Next.js動的インポート
- **メモ化**: React.memo、useMemo、useCallback
- **仮想化**: 大量タスクの場合はreact-windowを検討（将来）

### バックエンド

- **非同期処理**: ファイルI/Oは全て `fs/promises`
- **ストリーミング**: Claude APIレスポンスのSSEストリーミング
- **キャッシュ**: worktree情報のメモリキャッシュ（将来）

---

## スケーラビリティ

### データ量増加への対応

- **JSONファイル**: 数百タスク程度までは問題なし
- **データベース移行**: 1000タスク超える場合はSQLiteなどを検討

### 同時実行

- **Claude実行**: MVPでは逐次実行
- **並列実行**: Phase 5以降で対応

---

## 拡張性

### モジュール設計

- **Manager層**: ビジネスロジックを分離
- **型定義**: 一元管理で変更容易
- **API設計**: RESTful原則に従い拡張可能

### 将来的な拡張

- **Agent SDK統合**: `claude-client.ts` を置き換え
- **WebSocket**: リアルタイム同期
- **データベース**: スケーラビリティ向上
- **マルチユーザー**: 認証・認可の追加
