# Tsunagi - プロジェクト概要

## 🎯 プロジェクトのビジョン

### 人間が人間にしかできないことにフォーカスする

Tsunagiは、**人間が人間にしかできないことに集中できる環境**を提供します。

- **AIに任せられることはAIに任せる**: コーディング、ドキュメント作成、テストなど、ルーチンワークはClaudeに委譲
- **人間は創造的な活動に専念**: アーキテクチャ設計、要件定義、意思決定、レビューなど、判断が必要な部分に時間を使う
- **AI実行の可視化と制御**: Claudeが何をしているかを把握し、必要な時に介入できる透明性を確保

### ツールの役割

**Tsunagi（繋ぎ）** は、複数のGitHub組織のプロジェクトをローカル環境で統合管理し、Claude Agent SDKを介してAI駆動開発を可視化・制御するWeb UIツールです。

開発者が複数のリポジトリやブランチを横断してタスクを管理し、Claude AIによる自動化を効率的に活用できる環境を提供します。

---

## 💡 コアコンセプト

### 1. 統合管理

- **複数組織対応**: 複数のGitHub organizationのプロジェクトを1つのUIで管理
- **ローカル完結**: 全てのデータと作業がローカル環境で完結
- **Kanban可視化**: タスクの状態をKanban boardで直感的に把握

### 2. Git Worktree活用

- **owner/repo/branch** ディレクトリモデル
- Git worktreeによる効率的なブランチ管理
- タスクごとに独立した作業環境を自動構築

### 3. Claude Agent統合

- タスクに対するClaudeの実行状態をリアルタイム表示
- 実行ログの可視化
- 将来的にAgent SDKによる高度な制御

### 4. リアルタイム性

- WebSocketによる状態の常時更新
- 複数タスクの並行実行を可視化

---

## 🎨 主要機能

### Kanban Board

- **3列レイアウト**: Todo、In Progress、Done
- **ドラッグ&ドロップ**: タスクステータスの直感的な変更
- **フィルタリング**: owner/repo/ブランチ単位でタスクを絞り込み
- **検索**: タイトル・説明文での検索

### タスク管理

- タスクの作成・編集・削除
- タスクごとのClaudeへの指示設定
- **Claude自動見積もり**: 工数・優先度の自動判定
- **優先度ソート**: Claudeが判定した優先度順にタスクを自動並び替え
- 実行計画の表示（将来実装）
- 実行ログのリアルタイム表示
- **制約**: 1タスク = 1 worktree = 1 branch

### Git Worktree管理

- bare repositoryの自動初期化
- タスクごとのworktree自動作成・削除
- ディレクトリ構造の一元管理

### Claude実行

- タスクに対するプロンプト実行
- ストリーミングレスポンスの受信
- 実行状態の追跡（idle/running/waiting）
- ログの記録・表示

### 環境変数管理

- **グローバル/Owner/Repo単位**で環境変数を設定
- Terminal/VSCode/Claude起動時に自動読み込み
- `~/.tsunagi/env/` ディレクトリで管理
- 詳細は [@docs/environment-variables.md](./environment-variables.md) を参照

### リソース削除

- **Owner単位削除**: 配下の全repo/worktree/タスクを削除
- **Repo単位削除**: 配下の全worktree/タスクを削除
- **Branch単位削除**: worktree強制削除（未コミット変更があっても削除）
- git worktree removeを使用

### 外部ツール統合（オプション）

- Terminalの起動（worktreeディレクトリで、環境変数読み込み済み）
- VSCodeの起動（worktreeディレクトリで、環境変数読み込み済み）

---

## 📦 MVP範囲

### MVP（v1.0）に含まれる機能

✅ **Phase 1**: データモデル・基盤

- タスク・リポジトリのデータモデル
- JSON永続化
- REST API

✅ **Phase 2**: Kanban UI

- Kanban board表示
- ドラッグ&ドロップ
- タスクフィルター・検索
- タスク作成・編集UI

✅ **Phase 3**: Git Worktree管理

- bare repository初期化
- worktree作成・削除
- ディレクトリ構造管理

✅ **Phase 4**: Claude Agent基本統合

- Claude API統合（`@anthropic-ai/sdk`）
- ストリーミングログ表示
- 実行状態追跡

🆕 **Phase 4.5**: 環境変数・リソース削除・優先度判定

- 環境変数管理（グローバル/Owner/Repo単位）
- リソース削除（Owner/Repo/Branch）
- Claude自動見積もり（工数・優先度）
- 優先度順ソート

### 将来実装（v2.0以降）

⏸️ **Phase 5**: WebSocketリアルタイム更新
⏸️ **Phase 6**: 外部ツール統合（Terminal/VSCode）
🔮 実行計画の自動生成
🔮 複数Claudeの並列実行
🔮 タスク依存関係の管理
🔮 GitHub PR自動作成
🔮 通知機能
🔮 Agent SDKへの移行

---

## 🏗️ アーキテクチャ概要

### フロントエンド

- **Next.js 16** + **React 19**
- **Ark UI** - ヘッドレスUIコンポーネント
- **Kanban UI** - `@hello-pangea/dnd` でドラッグ&ドロップ
- **Monaco Editor** - プロンプト入力用
- TypeScript + Tailwind CSS v4

### バックエンド

- **Next.js API Routes** - REST API
- **WebSocket** - リアルタイム通信（将来）
- **simple-git** - Git操作
- **@anthropic-ai/sdk** - Claude統合

### データ管理

- **ファイルベース（JSON）**
  - `~/.tsunagi/state/tasks.json` - タスクデータ
  - `~/.tsunagi/state/repos.json` - リポジトリ設定
  - `~/.tsunagi/state/sessions.json` - Claude Sessions
- **Git Worktrees**
  - `~/.tsunagi/workspaces/{owner}/{repo}/` - bare repository
  - `~/.tsunagi/workspaces/{owner}/{repo}/{branch}/` - worktrees

---

## 📂 ドキュメント構成

本プロジェクトのドキュメントは以下の構成で管理されています：

- **[design-principles.md](./design-principles.md)** - UI/UX設計原則（全UI実装で必須参照）
- **[architecture.md](./architecture.md)** - 技術スタック・アーキテクチャ詳細
- **[data-models.md](./data-models.md)** - データモデル定義
- **[local-data.md](./local-data.md)** - ローカルデータ管理方法
- **[api-specification.md](./api-specification.md)** - REST API仕様
- **[git-worktree.md](./git-worktree.md)** - Git Worktree管理詳細
- **[implementation-plan.md](./implementation-plan.md)** - 実装計画・フェーズ
- **pages/**
  - **[kanban.md](./pages/kanban.md)** - Kanban UI仕様
  - **[task-detail.md](./pages/task-detail.md)** - タスク詳細UI仕様

---

## 🚀 クイックスタート

### 前提条件

- Node.js 20+
- Git
- Claude API Key

### セットアップ

```bash
# リポジトリのクローン
git clone <repository-url>
cd tsunagi

# 依存関係のインストール
npm install

# 環境変数の設定
echo "ANTHROPIC_API_KEY=your-api-key" > .env.local

# 開発サーバーの起動
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

---

## 📝 使い方

1. **リポジトリの登録**
   - 設定からGitHubリポジトリを登録

2. **タスクの作成**
   - Kanban boardで「+ Add Task」をクリック
   - タスク情報を入力（title、owner/repo/branch）

3. **Claudeの実行**
   - タスクカードをクリックして詳細を表示
   - Claudeへの指示を入力して実行

4. **進捗管理**
   - タスクをドラッグ&ドロップでステータス変更
   - フィルターで特定のリポジトリのタスクに絞り込み

---

## 🤝 コントリビューション

詳細は実装フェーズで整備予定です。

---

## 📄 ライセンス

TBD
