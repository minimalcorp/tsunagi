# AI Task Planner 実装計画

## 概要

KanbanBoardをTaskListに置き換え、Claudeと対話しながらタスクの作成・整理を行える2カラムUIを構築する。

## 決定事項

- [x] KanbanBoardはListに完全置き換え（メンテナンスコスト削減）
- [x] タスク作成はClaudeに判断を一任（対話→明確化→作成）
- [x] プランナーClaudeの実行ディレクトリは `~/.tsunagi`
- [x] PlannerPanelはxterm（TerminalView）ベース（タスク詳細と同じ構造）
- [x] タスク作成フローをUI/MCPで共通化
- [x] プランナーClaudeのスコープ: リポジトリ横断（スコープ絞りはClaudeがプロンプトから判断）
- [x] `baseBranchCommit` を廃止 — rebase検知は `merge-base` 方式に統一
- [x] worktree作成時のClaude MCP local scope登録を廃止 — plugin（user scope）で十分
- [x] default branch worktreeは `.default` ディレクトリに作成（タスク用worktreeと区別）

---

## 1. Claudeへのリポジトリ情報提供

### 方針: オンデマンドでdefault branch worktreeを `.default` に自動作成

プランナーClaudeの `cwd` は `~/.tsunagi`。リポジトリの内容を読む必要がある場合、`.default` worktreeを自動作成して参照する。

### ディレクトリ構成

```
~/.tsunagi/workspaces/{owner}/{repo}/
├── .bare/              # bare repo（既存）
├── .default/           # default branch worktree（プランナー参照用、新規）
├── feat-add-plugin/    # タスク用worktree（既存）
└── fix-bug-123/        # タスク用worktree（既存）
```

- `.bare` と同じドットプレフィックスで「システム用」と明示
- タスク用worktree（branch名ベース）と混同されない
- `parseWorktreePath()` で `.` 始まりを除外すればタスク解決の対象外にできる

### 現状の問題

- default branch worktreeは手動作成のため、存在しないリポジトリがある
- bare repoは全リポジトリで存在する（clone時に作成済み）が、worktreeは保証されない
- 既存のworktreeパス生成（`getWorktreePath(owner, repo, branch)`）はbranch名→ディレクトリ名の1:1マッピング。`.default` はこの仕組みとは独立

### 実装内容

1. **`worktree-manager.ts` に `ensureDefaultWorktree(owner, repo)` を追加**
   - `.default` ディレクトリが存在しない場合: `git worktree add .default origin/{defaultBranch}` で作成
   - 既に存在する場合: `git fetch origin --prune && git reset --hard origin/{defaultBranch}` で最新化
   - `getDefaultBranch()` でdefault branch名を動的に取得
   - 返却: `.default` worktreeの絶対パス
2. **tsunagi MCPに `tsunagi_ensure_default_worktree` ツールを追加**
   - 入力: `owner`, `repo`
   - 内部で `ensureDefaultWorktree()` を呼び出し
   - 返却: worktreeのパス
3. **system promptでClaudeに使い方を指示**
   - リポジトリの内容を読みたい場合、まずこのツールでworktreeを確保
   - 返却されたパスを使ってファイルを読む
4. **worktreeはread-only参照用**
   - system promptで変更禁止を明示
5. **既存の手動作成されたdefault branch worktree（`main/` 等）の扱い**
   - 移行: 既存の `main/` worktreeがタスクに紐づいていない場合、`.default` に移行可能
   - タスクに紐づいている場合はそのまま維持

### 補足: なぜcwdを `~/.tsunagi` にするか

- 複数リポジトリ横断で対話できる
- 特定リポジトリに縛られない汎用的なプランナーとして機能
- スコープの絞り込みはClaudeがユーザーのプロンプトから判断

---

## 2. `baseBranchCommit` 廃止計画

### 背景

rebase必要性の検知に `baseBranchCommit`（worktree作成時のbase branchコミットハッシュ）を保存していたが、`git merge-base` 方式で代替可能。

### `merge-base` 方式

```bash
merge_base=$(git merge-base HEAD origin/{baseBranch})
behind_count=$(git rev-list --count ${merge_base}..origin/{baseBranch})
# behind_count > 0 なら rebase 必要
```

- baseBranchとworktreeのHEADの比較だけで判定可能
- 保存状態が不要でシンプル
- 既にfallbackとして `worktree-manager.ts:313-321` に実装済み

### 削除対象リソース

| ファイル                                       | 内容                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `prisma/schema.prisma`                         | `baseBranchCommit` フィールド削除                                             |
| `src/lib/types.ts`                             | `baseBranchCommit` プロパティ削除                                             |
| `src/lib/repositories/task.ts`                 | create/update/mapでの `baseBranchCommit` 参照削除                             |
| `src/lib/worktree-manager.ts`                  | `createWorktree()` での `git rev-parse` + 返却値から削除                      |
| `src/lib/worktree-manager.ts`                  | `checkRebaseNeeded()` の stored commit 比較パス削除（merge-base方式のみ残す） |
| `src/lib/worktree-manager.ts`                  | `rebaseWorktree()` での新commit返却削除                                       |
| `src/app/api/tasks/route.ts`                   | worktree作成後の `baseBranchCommit` 保存削除                                  |
| `src/app/api/tasks/[id]/rebase/route.ts`       | rebase後の `baseBranchCommit` 更新削除                                        |
| `src/app/api/tasks/[id]/needs-rebase/route.ts` | `baseBranchCommit` パラメータ削除                                             |
| `src/app/api/worktrees/create/route.ts`        | レスポンスから `baseBranchCommit` 削除                                        |
| `server/routes/tasks.ts`                       | worktree作成後の `baseBranchCommit` 保存削除                                  |

### マイグレーション

- Prismaマイグレーション: `base_branch_commit` カラムをDROP

---

## 3. worktree作成時のClaude MCP登録廃止

### 背景

`createWorktree()` 内で `claude mcp add --transport sse --scope local tsunagi ...` を実行しているが、plugin（user scope）で既にグローバル登録済みのため冗長。

### 削除対象

| ファイル                      | 内容                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `src/lib/worktree-manager.ts` | `createWorktree()` 内の `claude mcp add` 実行部分（lines 183-194） |

---

## 4. UI構成

### PC版レイアウト (≥1024px)

```
┌─────────────────────────────────────────────────────┐
│  Header (リポジトリ選択、設定)                         │
├──────────────────────┬──────────────────────────────┤
│  TaskListPanel       │  PlannerPanel                │
│                      │                              │
│  [フィルタバー]       │  [Tab1][Tab2][+]             │
│  ┌────────────────┐  │  ┌──────────────────────────┐│
│  │ TaskCard       │  │  │                          ││
│  │ - id (5文字)   │  │  │  TerminalView (xterm)    ││
│  │ - title        │  │  │  Claude CLI 対話          ││
│  │ - description  │  │  │                          ││
│  │ - status badge │  │  │                          ││
│  │ - repo (色分け)│  │  │                          ││
│  │ - branch       │  │  │                          ││
│  │ - effort       │  │  │                          ││
│  └────────────────┘  │  │                          ││
│  ┌────────────────┐  │  │                          ││
│  │ TaskCard ...   │  │  │                          ││
│  └────────────────┘  │  └──────────────────────────┘│
├──────────────────────┴──────────────────────────────┤
└─────────────────────────────────────────────────────┘
```

### レスポンシブ方針

| デバイス    | ブレークポイント | レイアウト                                       |
| ----------- | ---------------- | ------------------------------------------------ |
| PC/Tablet横 | ≥1024px          | 左右2カラム（両方表示、リサイズ可能）            |
| SP/Tablet縦 | <1024px          | Bottom Tab切り替え（タスク一覧 / Claude / 設定） |

- 同一ページ・同一コンポーネント、media queryで表示切り替え
- <1024px: TaskListPanelとPlannerPanelをBottom Tabで切り替え表示

---

## 5. TaskListPanel（左パネル）

### コンポーネント構成

```
TaskListPanel
├── SearchAndFilterBar（検索 + フィルタボタン）
│   ├── 検索input
│   └── [Filter]ボタン → FilterDialog
│       ├── Repository filter（トグルチップ）
│       └── Status filter（トグルチップ）
└── TaskList（D&D対応リスト）
    └── TaskCard（個別タスク）
```

### 検索・フィルタUI

タスク一覧の最上部に配置。Headerからは検索・フィルタ機能を削除し、ここに集約する。

```
┌──────────────────────┐
│ [🔍 Search...] [⚙]  │  ← 検索input + Filterボタン（横並び）
├──────────────────────┤
│ Task Card            │
│ Task Card            │
│ ...                  │
└──────────────────────┘
```

- **検索input**: テキスト入力でタスクタイトルをフィルタ
- **Filterボタン**: クリックでFilterDialogを表示
- **FilterDialog**: リポジトリ / ステータスのトグルチップを表示
  - Repository filter: リポジトリごとの色分けチップ（複数選択可）
  - Status filter: backlog/planning/coding/reviewing/done のチップ（複数選択可）
  - 選択状態はDialogを閉じても保持
  - アクティブなフィルタ数をFilterボタンにバッジ表示

### 修正対象

| 変更                       | 内容                                         |
| -------------------------- | -------------------------------------------- |
| Header                     | 検索input・リポジトリフィルタを削除          |
| SearchAndFilterBar（新規） | 検索input + Filterボタンのコンパクトなバー   |
| FilterDialog（新規）       | repo/statusフィルタのDialog                  |
| TaskListPanel              | SearchAndFilterBarを統合                     |
| page.tsx                   | フィルタstateの管理をTaskListPanel起点に変更 |

### TaskCard 表示項目

| 項目        | 表示仕様                                          |
| ----------- | ------------------------------------------------- |
| id          | 先頭5文字 + ellipsis、コピーボタン付き            |
| title       | メインテキスト                                    |
| description | サブテキスト（truncate）                          |
| status      | バッジ（backlog/planning/coding/reviewing/done）  |
| repository  | `owner/repo` ハッシュベース色分け表示（下記参照） |
| branch      | ブランチ名                                        |
| effort      | 工数（hours）                                     |

### リポジトリ色分けロジック

`owner/repo` 文字列をハッシュ化し、事前定義カラーパレットのインデックスとして使用。

- **ハッシュ関数**: シンプルな文字列ハッシュ（djb2等）で十分
- **カラーパレット**: 8〜12種類のbg/textペアを事前定義（ライト/ダークテーマ両対応）
- **決定性**: 同じ `owner/repo` → 同じハッシュ → 常に同じ色
- **衝突**: リポジトリ数が少ないため、多少の色被りは許容

```typescript
const REPO_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300' },
  { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-300' },
  // ... 12種類
];

function getRepoColor(owner: string, repo: string) {
  const hash = djb2(`${owner}/${repo}`);
  return REPO_COLORS[hash % REPO_COLORS.length];
}
```

### 並び替え・フィルタ

- **デフォルトソート**: `order`（優先度）順
- **Drag & Drop**: カード並び替えで `order` を更新
- **フィルタ**: status, repo, 検索テキスト

### KanbanBoardからの移行

- KanbanBoard、KanbanColumn コンポーネントは廃止
- ステータス変更はTaskCardのドロップダウン or Claudeへの指示で行う
- D&Dは優先度変更用に使用（`@hello-pangea/dnd` を流用）

---

## 6. PlannerPanel（右パネル）

### 構成

タスク詳細ページの TerminalPanel と同じアーキテクチャを流用:

```
PlannerPanel
├── SessionTabs（タブバー: 追加・削除・切り替え）
└── TerminalView（xterm: Claude CLI セッション）
```

### タブ管理

- プランナー用タブをDBに永続化（PlannerTabモデル or 既存Tab拡張）
- 各タブにUUIDを発行し、Claude CLIの `--session-id` として使用
- 再起動時: `claude --resume {uuid}` で途中から再開可能
- タブ作成時にClaude CLIを自動起動（`claude --dangerously-skip-permissions --session-id {uuid}`）
- 複数タブの同時実行をサポート
- タブの追加・削除・切り替えはタスク詳細と同じUX

### プランナーClaude vs タスクClaude

| 項目           | タスク詳細のClaude     | プランナーのClaude                     |
| -------------- | ---------------------- | -------------------------------------- |
| cwd            | タスクのworktree       | `~/.tsunagi`                           |
| system prompt  | タスクワークフロー用   | タスク企画・整理用                     |
| 主な用途       | コーディング・レビュー | タスク作成・優先度整理・分析           |
| MCPツール      | tsunagi MCP            | tsunagi MCP（全ツール）                |
| リポジトリ参照 | worktree直接           | `tsunagi_ensure_default_worktree` 経由 |
| スコープ       | 単一タスク             | リポジトリ横断                         |

### system prompt（プランナー用）の方針

- tsunagi MCPツールの使用方法
- `tsunagi_ensure_default_worktree` でリポジトリ内容を参照できること
- タスク一覧の確認 → 重複チェック → 対話 → 作成 のフロー指示
- worktreeのファイルは変更禁止であること

---

## 7. MCP/API のサービスレイヤー統合

### 現状の問題（調査結果）

MCPハンドラがPrismaを直接呼び出しており、API（リポジトリ層）と重複・不整合が発生している。

| MCP ツール                        | MCP実装                       | API実装                     | 共有コード | 問題                         |
| --------------------------------- | ----------------------------- | --------------------------- | ---------- | ---------------------------- |
| `tsunagi_create_task`             | サービス経由                  | サービス経由                | **あり**   | ✓ 統合済み                   |
| `tsunagi_list_tasks`              | Prisma直接                    | リポジトリ層                | なし       | 重複                         |
| `tsunagi_get_task`                | Prisma直接 + resolveTask      | リポジトリ層                | なし       | 重複                         |
| `tsunagi_update_task`             | Prisma直接 + resolveTask      | リポジトリ層                | なし       | 重複                         |
| `tsunagi_delete_task`             | Prisma直接（soft deleteのみ） | リポジトリ層 + worktree削除 | なし       | **不完全**（worktree未削除） |
| `tsunagi_list_repos`              | Prisma直接                    | リポジトリ層                | なし       | 重複                         |
| `tsunagi_get_tab_todos`           | todoStore直接                 | API相当なし                 | —          | MCP固有（問題なし）          |
| `tsunagi_ensure_default_worktree` | サービス経由                  | API相当なし                 | **あり**   | ✓ 統合済み                   |

### 方針: サービスレイヤーに統合

`src/lib/services/task-service.ts` を拡充し、全操作をサービス関数として提供。MCP・Fastify・Next.js APIすべてがサービス関数を呼び出す形に統一する。

```
呼び出し元               サービス層                    データ層
─────────────────      ────────────────────────      ──────────────
MCP handler      ─┐
Fastify route    ─┼──→  task-service.ts           ──→  repositories/task.ts
Next.js API      ─┘     (ビジネスロジック)              (DB操作)
                         + worktree-manager.ts
                         + Socket.IO通知
```

### 追加するサービス関数

| サービス関数                         | 対応MCP                           | 内容                                                                         |
| ------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| `listTasks(filter)`                  | `tsunagi_list_tasks`              | リポジトリ層の `taskRepo.getTasks()` を呼ぶ                                  |
| `getTask(identifier)`                | `tsunagi_get_task`                | id / session_id / cwd でタスク解決（`resolveTask` ロジックをサービスに移動） |
| `updateTask(identifier, updates)`    | `tsunagi_update_task`             | タスク解決 + リポジトリ層の `taskRepo.updateTask()`                          |
| `deleteTask(identifier)`             | `tsunagi_delete_task`             | タスク解決 + soft delete + worktree削除 + Socket.IO通知                      |
| `listRepos()`                        | `tsunagi_list_repos`              | リポジトリ層の `repoRepo.getRepos()` を呼ぶ                                  |
| `createTask(params)`                 | `tsunagi_create_task`             | **既存**（統合済み）                                                         |
| `ensureDefaultWorktree(owner, repo)` | `tsunagi_ensure_default_worktree` | **既存**（統合済み）                                                         |

### resolveTask の統合

MCPの `resolveTask(args)` ヘルパー（id / session_id / cwd でタスクを解決）をサービス層に移動。

```typescript
// task-service.ts に追加
type TaskIdentifier = { id?: string; session_id?: string; cwd?: string };

async function resolveTask(identifier: TaskIdentifier): Promise<Task | null> {
  // 1. id → taskRepo.getTask(id)
  // 2. session_id → Tab検索 → taskRepo.getTask(taskId)
  // 3. cwd → パスパース → owner/repo/branch でタスク検索
}
```

### MCP側の変更

MCPハンドラからPrisma直接呼び出しを削除し、サービス関数を呼ぶだけのthin wrapperにする。

```typescript
// 修正後のMCPハンドラ（例）
case 'tsunagi_list_tasks': {
  const tasks = await listTasks({ owner, repo, status });
  return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
}
```

### Claudeによるタスク作成フロー

```
ユーザー: 「〇〇の機能を追加したい」
    ↓
Claude: タスク一覧を確認（tsunagi_list_tasks）
    ↓
Claude: 類似タスクがあればユーザーに報告・指示を仰ぐ
    ↓
Claude: 要望が不明確なら対話で明確化
    ↓
Claude: 要望が明確になったらタスク作成（tsunagi_create_task）
    ↓
Claude: 作成完了を報告
```

---

## 8. リポジトリ削除機能

### 背景

リポジトリのcloneはできるが削除ができない。fetchの問題等でbare repoが壊れた場合にクリーンに再cloneできる手段が必要。

### 現状

- `DELETE /api/repos/[owner]/[repo]` — DB削除のみ（ファイルシステム未削除）
- DBはcascade設定済み: Repository削除 → Task, Tab, EnvironmentVariable すべて連鎖削除
- UIに削除機能なし

### 実装内容

1. **`DELETE /api/repos/[owner]/[repo]` を拡張**（ファイルシステム削除を追加）
   - 実行中のClaudeプロセス/PTYセッションの確認・停止
   - 全worktreeの削除: `git worktree remove` for each worktree
   - `.default` worktreeの削除
   - `.bare` ディレクトリの削除
   - ワークスペースディレクトリ全体の削除: `~/.tsunagi/workspaces/{owner}/{repo}/`
   - DB削除（cascade: tasks, tabs, env vars）
2. **設定画面にリポジトリ管理セクションを追加**
   - リポジトリ一覧表示
   - 各リポジトリに削除ボタン
   - 確認ダイアログ（「このリポジトリに紐づくタスク N件も削除されます」）

### 削除フロー

```
ユーザー: 設定画面で削除ボタンをクリック
    ↓
確認ダイアログ（紐づくタスク数を表示）
    ↓
DELETE /api/repos/{owner}/{repo}
    ↓
1. 実行中セッションの確認・停止
2. git worktree list → 全worktree削除
3. rm -rf ~/.tsunagi/workspaces/{owner}/{repo}/
4. DB cascade削除（Repository + Task + Tab + EnvironmentVariable）
5. Socket.IO通知
    ↓
UI更新（リポジトリ一覧・タスクリストから除去）
```

---

## 9. 実装ステップ

### Phase 0〜5: 完了済み

Phase 0〜5は実装済み。詳細は変更履歴を参照。

### Phase 6: サービスレイヤー統合（次に実施）

1. `task-service.ts` に `resolveTask()` を移動（mcp.tsの `resolveTask` + `parseWorktreePath` をサービスへ）
2. `task-service.ts` に `listTasks()`, `getTask()`, `updateTask()`, `deleteTask()`, `listRepos()` を追加
3. `deleteTask()` にworktree削除ロジックを統合（MCP経由でもworktreeが削除されるように）
4. MCPハンドラをthin wrapperにリファクタ（Prisma直接呼び出しを全削除）
5. Fastify/Next.js APIルートも同じサービス関数を使うように統一
6. mcp.tsからPrisma importを削除

---

## 変更履歴

- 2026-03-29: 初版作成
- 2026-03-29: v2 更新。KanbanBoard廃止決定、タスク作成フロー統合方針、リポジトリ参照方式変更（オンデマンドworktree自動作成）、TaskCard仕様確定、調査結果を反映
- 2026-03-29: v3 更新。`baseBranchCommit` 廃止計画追加（merge-base方式に統一）、worktree作成時のMCP登録廃止、プランナーClaudeはリポジトリ横断に決定、タスク作成ステップから不要ステップを削除
- 2026-03-29: v4 更新。リポジトリ削除機能追加（設定画面UI + ファイルシステム削除 + DB cascade削除）
- 2026-03-29: v5 更新。SP/Tablet縦対応をPhase 2に追加（Bottom Tab切り替え）、ブレークポイントを1024px一本に簡略化
- 2026-03-29: v6 更新。MCP/APIサービスレイヤー統合計画追加。MCPのPrisma直接呼び出しを排除し、全操作をサービス関数経由に統一
