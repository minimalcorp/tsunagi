# Tsunagi (繋ぎ)

複数GitHub組織のプロジェクトをローカルで統合管理し、Claude Agent SDKを介してAI駆動開発を可視化・制御するWeb UIツール

---

## 概要

**Tsunagi**は、複数のGitHub organizationのプロジェクトを1つのUIで統合管理し、Claude AIによる開発タスクを効率化するローカルツールです。

### 主要機能

- **Kanban Board** - タスクを視覚的に管理、優先度順ソート
- **Git Worktree統合** - `owner/repo/branch` ディレクトリモデルで効率的なブランチ管理
- **Claude統合** - タスクごとのAI実行・ログ可視化、工数・優先度の自動見積もり
- **環境変数管理** - グローバル/Owner/Repo単位で設定、自動読み込み
- **リソース削除** - Owner/Repo/Branch単位で完全削除
- **リアルタイム更新** - WebSocketによる常時同期（Phase 5）

---

## クイックスタート

### 前提条件

- Node.js 20+
- Git
- Claude API Key

### セットアップ

```bash
# 依存関係のインストール
npm install

# 環境変数の設定
echo "ANTHROPIC_API_KEY=your-api-key" > .env.local

# 開発サーバーの起動
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

---

## ドキュメント

詳細な仕様は `docs/` ディレクトリを参照してください：

### 主要ドキュメント

- **[docs/overview.md](./docs/overview.md)** - プロジェクト概要
- **[docs/design-principles.md](./docs/design-principles.md)** - UI/UX設計原則（必読）
- **[docs/architecture.md](./docs/architecture.md)** - 技術スタック・アーキテクチャ
- **[docs/implementation-plan.md](./docs/implementation-plan.md)** - 実装計画

### データ・API

- **[docs/data-models.md](./docs/data-models.md)** - データモデル定義
- **[docs/local-data.md](./docs/local-data.md)** - ローカルデータ管理
- **[docs/api-specification.md](./docs/api-specification.md)** - REST API仕様

### 機能詳細

- **[docs/git-worktree.md](./docs/git-worktree.md)** - Git Worktree管理
- **[docs/environment-variables.md](./docs/environment-variables.md)** - 環境変数管理
- **[docs/pages/kanban.md](./docs/pages/kanban.md)** - Kanban UI仕様
- **[docs/pages/task-detail.md](./docs/pages/task-detail.md)** - タスク詳細UI仕様

---

## 使い方

### 1. リポジトリの登録

設定からGitHubリポジトリを登録します。

```json
{
  "owner": "minimalcorp",
  "repo": "tsunagi",
  "cloneUrl": "https://github.com/minimalcorp/tsunagi.git"
}
```

### 2. タスクの作成

Kanban boardで「+ Add Task」をクリックし、タスク情報を入力します。

- タイトル
- 説明
- owner/repo/branch

タスク作成時に、Git worktreeが自動で `~/.tsunagi/workspaces/owner/repo/branch/` に作成されます。

### 3. Claudeの実行

タスクカードをクリックして詳細を表示し、Claudeへの指示を入力して実行します。

実行ログがリアルタイムで表示されます。

### 4. 進捗管理

タスクをドラッグ&ドロップでステータス変更（Todo/In Progress/Done）できます。

フィルターで特定のowner/repoのタスクに絞り込めます。

---

## ディレクトリ構造

### プロジェクト

```
tsunagi/
├── docs/              # ドキュメント
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── api/        # API Routes
│   │   └── page.tsx    # メインページ
│   ├── components/     # Reactコンポーネント
│   └── lib/            # ビジネスロジック
└── package.json
```

### ローカルデータ

```
~/.tsunagi/                      # 設定・データ
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

## 開発

### スクリプト

```bash
# 開発サーバー
npm run dev

# ビルド
npm run build

# 本番サーバー
npm run start

# Lint
npm run lint

# フォーマット
npm run format
```

### コミット

```bash
# フォーマット + Lint実行（自動）
git commit -m "message"
```

---

## 技術スタック

- **Next.js 16** - フレームワーク
- **React 19** - UI
- **TypeScript** - 型安全性
- **Tailwind CSS v4** - スタイリング
- **Ark UI** - ヘッドレスUIコンポーネント
- **Monaco Editor** - コードエディタ
- **@hello-pangea/dnd** - ドラッグ&ドロップ
- **simple-git** - Git操作
- **@anthropic-ai/sdk** - Claude統合

---

## ロードマップ

### MVP（v1.0）

- [x] データモデル・基盤
- [x] Kanban UI
- [x] Git Worktree管理
- [x] Claude Agent基本統合
- [x] 環境変数管理（グローバル/Owner/Repo）
- [x] リソース削除（Owner/Repo/Branch強制削除）
- [x] Claude自動見積もり（工数・優先度判定）
- [x] 優先度順ソート

### 将来実装（v2.0+）

- [ ] WebSocketリアルタイム更新
- [ ] 外部ツール統合（Terminal/VSCode）
- [ ] 実行計画の自動生成
- [ ] 複数Claudeの並列実行
- [ ] タスク依存関係の管理
- [ ] GitHub PR自動作成

---

## コントリビューション

現在準備中です。

---

## ライセンス

TBD

---

**AI と人間の最適な協働で、開発をもっと速く、もっとスマートに。**
