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

- **Kanban Board** - タスクの視覚的管理、ドラッグ&ドロップ、フィルタリング（詳細: [kanban.md](./pages/kanban.md)）
- **タスク管理** - CRUD操作、Claude自動見積もり、優先度ソート（詳細: [task-detail.md](./pages/task-detail.md)）
- **Git Worktree管理** - 自動初期化、worktree作成・削除（詳細: [git-worktree.md](./git-worktree.md)）
- **Claude Agent SDK統合** - プロンプト実行、ストリーミングログ、実行状態追跡
- **環境変数管理** - グローバル/Owner/Repo単位設定、自動読み込み（詳細: [environment-variables.md](./environment-variables.md)）
- **リソース削除** - Owner/Repo/Branch単位の完全削除
- **外部ツール統合** - Terminal/VSCode起動（Phase 6）

各機能の詳細仕様は下記のドキュメント構成を参照してください。

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

✅ **Phase 4**: Claude Agent SDK統合

- Claude Agent SDK統合（`@anthropic-ai/agent-sdk`）
- ストリーミングログ表示
- 実行状態追跡

🆕 **Phase 4.5**: 環境変数・リソース削除・優先度判定

- 環境変数管理（グローバル/Owner/Repo単位）
- リソース削除（Owner/Repo/Branch）
- Claude自動見積もり（工数・優先度）
- 優先度順ソート

### 将来実装（v2.0以降）

⏸️ **Phase 5**: WebSocketリアルタイム更新

- Socket.IO統合（イベント駆動アーキテクチャ）
- **デュアルインターフェース実装**: REST APIとWebSocketの両方を実装
- **フォールバック戦略**: WebSocket接続失敗時はREST APIポーリングに自動切替
- サーバー側controller層による統一的な状態管理

⏸️ **Phase 6**: 外部ツール統合（Terminal/VSCode）
🔮 実行計画の自動生成
🔮 複数Claudeの並列実行
🔮 タスク依存関係の管理
🔮 GitHub PR自動作成
🔮 通知機能

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
