# Tsunagi (繋ぎ)

複数GitHub組織のプロジェクトをローカルで統合管理し、Claude Agent SDKを介してAI駆動開発を可視化・制御するWeb UIツール

---

## 🎯 ビジョン

### 人間が人間にしかできないことにフォーカスする

Tsunagiは、**人間が人間にしかできないことに集中できる環境**を提供します。

- **AIに任せられることはAIに任せる**: コーディング、ドキュメント作成、テストなど、ルーチンワークはClaudeに委譲
- **人間は創造的な活動に専念**: アーキテクチャ設計、要件定義、意思決定、レビューなど、判断が必要な部分に時間を使う
- **AI実行の可視化と制御**: Claudeが何をしているかを把握し、必要な時に介入できる透明性を確保

---

## 概要

**Tsunagi**は、複数のGitHub organizationのプロジェクトを1つのUIで統合管理し、Claude AIによる開発タスクを効率化するローカルツールです。

開発者が複数のリポジトリやブランチを横断してタスクを管理し、Claude AIによる自動化を効率的に活用できる環境を提供します。

### コアコンセプト

#### 1. 統合管理

- **複数組織対応**: 複数のGitHub organizationのプロジェクトを1つのUIで管理
- **ローカル完結**: 全てのデータと作業がローカル環境で完結
- **タスク一覧 + プランナー UI**: タスクの状態を一覧形式で直感的に把握

#### 2. Git Worktree活用

- **owner/repo/branch** ディレクトリモデル
- Git worktreeによる効率的なブランチ管理
- タスクごとに独立した作業環境を自動構築

#### 3. Claude Agent統合

- タブ型セッション管理による柔軟な会話コンテキスト
- タスクごとに複数の独立した会話タブを作成可能
- 実行状態のリアルタイム表示とログの可視化
- Agent SDKによる高度な制御とインタラプト機能

#### 4. リアルタイム性

- Server-Sent Events（SSE）による状態の常時更新
- タスクとClaudeセッションの自動同期
- 複数タスクの並行実行を可視化

### 主要機能

- **タスク管理 UI** - タスク一覧 + プランナー、フィルタリング、優先度ソート、CRUD 操作
- **タスク詳細・タブ型セッション** - タスク単位での複数 Claude セッション管理（詳細: [docs/pages/task-detail.md](./docs/pages/task-detail.md)）
- **Git Worktree管理** - 自動初期化、worktree作成・削除（詳細: [docs/git-worktree.md](./docs/git-worktree.md)）
- **Claude Agent SDK統合** - タブ型セッション管理、リアルタイムストリーミング、実行状態追跡
- **環境変数管理** - グローバル/Owner/Repo単位設定、自動読み込み（詳細: [docs/environment-variables.md](./docs/environment-variables.md)）
- **リソース削除** - Owner/Repo/Branch単位の完全削除
- **外部ツール統合** - Terminal/VSCode起動
- **リアルタイム更新** - Server-Sent Events（SSE）によるリアルタイム状態同期

各機能の詳細仕様は下記のドキュメントを参照してください。

---

## クイックスタート

### 前提条件

- **Node.js 20+**
- **Git 2.42+**（空リポジトリ対応で `git worktree add --orphan` を使用）
- **Claude Code CLI**（`claude` コマンドが PATH 上に必要）
- **macOS または Linux**（Windowsは非サポート）
- **Anthropic API Key** または **Claude Code OAuth Token**

### npm で起動（推奨）

```bash
npx @minimalcorp/tsunagi
```

または、グローバルインストール:

```bash
npm install -g @minimalcorp/tsunagi
tsunagi
```

起動後、ブラウザで `http://localhost:2791` を開きます。

### ソースから起動（開発用）

```bash
git clone https://github.com/minimalcorp/tsunagi.git
cd tsunagi
npm ci

# 環境変数の設定
echo "ANTHROPIC_API_KEY=your-api-key" > .env.local

# 開発サーバーの起動
npm run dev
```

ブラウザで `http://localhost:2791` を開きます。

---

## 動作環境・制約

### 対応OS

- **macOS**
- **Linux**
- Windows は**非サポート**です（WSL2 経由で動作する可能性はありますが保証されません）

### 単一インスタンス制約

Tsunagi は同時に1インスタンスのみ起動できます。2つ目を起動しようとすると「Another tsunagi is running」と表示されて終了します。PIDロックファイル (`~/.tsunagi/state/tsunagi.lock`) で排他制御を行っています。

### Claude Code プラグインの自動管理

Tsunagi は起動時に Claude Code の marketplace と plugin を自動的にインストールし、終了時にアンインストールします:

- **起動時**: `claude plugin marketplace add` → `claude plugin install tsunagi-plugin` をクリーンインストール
- **終了時**: `claude plugin uninstall tsunagi-plugin` → `claude plugin marketplace remove` で後始末
- **前回クラッシュによる孤児**が残っていた場合、次回起動時に自動的に再インストールします

すべて公式の `claude` CLI コマンドのみを使用します。`~/.claude/settings.json` を直接編集することはありません。

### データ保存場所

Tsunagi のローカルデータは `~/.tsunagi/` 以下に保存されます:

- `~/.tsunagi/state/tsunagi.db` - SQLite データベース
- `~/.tsunagi/state/tsunagi.lock` - 単一インスタンスロックファイル
- `~/.tsunagi/backups/` - DBバックアップ
- `~/.tsunagi/workspaces/` - Git worktree

環境変数 `TSUNAGI_DATA_DIR` で保存先を変更できます。

---

## 📂 ドキュメント

詳細な仕様は `docs/` ディレクトリを参照してください：

- **[docs/design-principles.md](./docs/design-principles.md)** - UI/UX設計原則（全UI実装で必須参照）
- **[docs/architecture.md](./docs/architecture.md)** - 技術スタック・アーキテクチャ詳細
- **[docs/data-models.md](./docs/data-models.md)** - データモデル定義
- **[docs/local-data.md](./docs/local-data.md)** - ローカルデータ管理方法
- **[docs/git-worktree.md](./docs/git-worktree.md)** - Git Worktree管理詳細
- **docs/apis/** - API仕様
  - **[docs/apis/overview.md](./docs/apis/overview.md)** - API全体像（必読）
  - **[docs/apis/common.md](./docs/apis/common.md)** - 共通仕様
  - **[docs/apis/tasks.md](./docs/apis/tasks.md)** - Tasks API
  - **[docs/apis/repositories.md](./docs/apis/repositories.md)** - Repositories API
  - **[docs/apis/environments.md](./docs/apis/environments.md)** - Environment Variables API
  - タブセッション管理（実装済み、ドキュメント整備中）
- **docs/pages/** - UI仕様
  - **[docs/pages/task-detail.md](./docs/pages/task-detail.md)** - タスク詳細UI仕様
  - **[docs/pages/environment-settings.md](./docs/pages/environment-settings.md)** - 環境変数設定UI仕様

---

## 📝 使い方

1. **リポジトリの登録**
   - 設定からGitHubリポジトリを登録

2. **タスクの作成**
   - タスク一覧で「+ Add Task」をクリック
   - タスク情報を入力（title、owner/repo/branch）

3. **Claudeの実行**
   - タスクカードをクリックして詳細を表示
   - 新しいタブを作成して会話を開始
   - Claudeへの指示を入力して実行
   - 複数のタブで異なるコンテキストの会話を並行管理

4. **進捗管理**
   - タスクをドラッグ&ドロップでステータス変更
   - フィルターで特定のリポジトリのタスクに絞り込み
   - リアルタイムで実行状態を確認

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
│   ├── tsunagi.db               # SQLite データベース（タスク・タブ・リポジトリ等）
│   └── tsunagi.lock             # 単一インスタンスロックファイル
├── backups/                     # DB バックアップ
└── workspaces/                  # Git Worktrees
    └── {owner}/                 # GitHub organization/user
        └── {repo}/              # リポジトリ名
            ├── .bare/           # bare repository
            ├── main/            # mainブランチのworktree
            └── {branch}/        # 各ブランチのworktree
```

---

## 開発

### Docker コマンド（推奨）

```bash
# コンテナ起動
make up

# コンテナ停止
make down

# ログ表示
make logs

# コンテナ一覧
make ps

# シェル起動
make shell

# イメージ再ビルド
make rebuild

# ボリューム含めて削除
make clean
```

### npm スクリプト

```bash
# 開発サーバー
make dev  # または npm run dev

# ビルド
make build  # または npm run build

# 本番サーバー
npm run start

# Lint
make lint  # または npm run lint

# フォーマット
make format  # または npm run format

# 型チェック
make type-check  # または npm run type-check
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
- **@anthropic-ai/claude-agent-sdk** - Claude Agent SDK統合（v0.2.17）
- **Socket.IO** - WebSocketリアルタイム通信
- **@xyflow/react** - フロー図・ビジュアライゼーション
- **react-markdown** - Markdown表示

---

## 🚀 ロードマップ

### MVP（v1.0）に含まれる機能

✅ **Phase 1**: データモデル・基盤

- タスク・リポジトリのデータモデル
- JSON永続化
- REST API

✅ **Phase 2**: タスク管理 UI

- タスク一覧 + プランナー表示
- タスクフィルター・検索
- タスク作成・編集 UI
- 優先度の並び替え

✅ **Phase 3**: Git Worktree管理

- bare repository初期化
- worktree作成・削除
- ディレクトリ構造管理

✅ **Phase 4**: Claude Agent SDK統合

- Claude Agent SDK統合（`@anthropic-ai/claude-agent-sdk` v0.2.17）
- タブ型セッション管理（複数の会話コンテキスト）
- リアルタイムストリーミングログ表示
- 実行状態追跡とインタラプト機能

✅ **Phase 4.5**: 環境変数・リソース削除

- 環境変数管理（グローバル/Owner/Repo単位）
- ツリー型ナビゲーション
- リソース削除（Owner/Repo/Branch）
- 外部ツール統合（Terminal/VSCode起動）

🔄 **Phase 5**: リアルタイム更新（実装中）

- Server-Sent Events（SSE）による状態同期
- タスクとClaudeセッションのリアルタイム更新
- Socket.IO統合準備（イベント駆動アーキテクチャへの移行）

### 将来実装（v2.0以降）

⏸️ **Phase 5.5**: WebSocketフル統合

- Socket.IOによる双方向通信
- **デュアルインターフェース実装**: REST APIとWebSocketの両方を実装
- **フォールバック戦略**: WebSocket接続失敗時はSSEに自動切替
- サーバー側controller層による統一的な状態管理

🔮 実行計画の自動生成
🔮 複数Claudeの並列実行
🔮 タスク依存関係の管理
🔮 GitHub PR自動作成
🔮 通知機能

---

## 🤝 コントリビューション

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

外部コントリビューターの方は、PR送信時に CLA (Contributor License Agreement) への同意が必要です（CLA Assistant bot が自動的にPR上でガイドします）。

---

## 📄 ライセンス

Tsunagi は **[PolyForm Shield License 1.0.0](./LICENSE)** のもとで公開されています。

**要点:**

- ✅ 個人利用、社内利用、業務での利用は自由です
- ✅ ソースコードの閲覧、学習、修正は自由です
- ❌ Tsunagi と**競合する製品**を作成・配布することは禁止されています
- ❌ Tsunagi をホスティングサービス（SaaS等）として第三者に提供することは禁止されています

これは OSI 承認の OSS ライセンスではなく **source-available** ライセンスです。詳細は [LICENSE](./LICENSE) を参照してください。

著作権者である minimalcorp は、将来的に有償プラン・マネージドサービス・エンタープライズ版等を提供する権利を保持します。

---

**AI と人間の最適な協働で、開発をもっと速く、もっとスマートに。**
