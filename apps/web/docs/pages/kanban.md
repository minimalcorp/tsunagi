# Kanban UI仕様

Tsunagiのメインページとなるkanban boardの仕様について説明します。

**📌 重要**: すべてのUI実装は **[設計原則](../design-principles.md)** に従ってください。

---

## 概要

Kanban UIは、タスクを視覚的に管理するためのメインインターフェースです。5列のカラム（Backlog、Planning、Coding、Reviewing、Done）でタスクのステータスを表現し、ドラッグ&ドロップで直感的に操作できます。

**初回ユーザーサポート**: リポジトリ未登録、環境変数未設定、タスク未作成など、初回起動時の状態に応じてチュートリアル的なハイライト表示を行い、ユーザーを次のステップに誘導します。

---

## 初回ユーザーフロー

Tsunagiを初めて起動したユーザーは、以下の手順で開発を開始します：

```
1. Git repositoryをclone
   ↓
2. Claude API トークンを環境変数に設定
   ↓
3. タスクを作成（Backlog）
   ↓
4. 計画・仕様作成（Planning）
   ↓
5. 実装（Coding）
   ↓
6. レビュー・修正（Reviewing）
   ↓
7. 完了（Done）
```

このフローをサポートするため、Kanban UIは**現在の状態**を検出し、**次に必要な操作**をハイライト表示します。

---

## 初回表示ロジック

Kanban UIは、起動時に以下の順序で状態をチェックし、最初に該当する条件のUIをハイライト表示します：

### 表示優先順位

1. **リポジトリ未登録**: リポジトリが1つもない
   - → "Clone Repository" ボタンをハイライト
   - → Empty Stateとして「まずはリポジトリをクローンしましょう」を表示

2. **環境変数未設定**: `ANTHROPIC_API_KEY` または `CLAUDE_CODE_OAUTH_TOKEN` が未設定
   - → "Environment Settings" ボタンをハイライト
   - → 警告バナー表示「環境変数を設定してください」

3. **タスク未作成**: タスクが1つもない
   - → "+ Add Task" ボタンをハイライト
   - → Empty Stateとして「最初のタスクを作成しましょう」を表示

4. **通常状態**: 上記すべて満たされている
   - → ハイライトなし、通常のKanban boardを表示

### 状態検出

```tsx
interface OnboardingState {
  hasRepositories: boolean; // リポジトリが1つ以上存在するか
  hasAnthropicApiKey: boolean; // ANTHROPIC_API_KEY が設定されているか
  hasClaudeCodeToken: boolean; // CLAUDE_CODE_OAUTH_TOKEN が設定されているか
  hasTasks: boolean; // タスクが1つ以上存在するか
}

function detectOnboardingState(): {
  state: OnboardingState;
  nextStep: 'clone' | 'env' | 'task' | 'complete';
} {
  const state = {
    hasRepositories: repositories.length > 0,
    hasAnthropicApiKey: Boolean(globalEnv.ANTHROPIC_API_KEY),
    hasClaudeCodeToken: Boolean(globalEnv.CLAUDE_CODE_OAUTH_TOKEN),
    hasTasks: tasks.length > 0,
  };

  // 優先順位順にチェック
  if (!state.hasRepositories) {
    return { state, nextStep: 'clone' };
  }
  if (!state.hasAnthropicApiKey || !state.hasClaudeCodeToken) {
    return { state, nextStep: 'env' };
  }
  if (!state.hasTasks) {
    return { state, nextStep: 'task' };
  }

  return { state, nextStep: 'complete' };
}
```

---

## 初回表示UI仕様

### 1. リポジトリ未登録時

**表示内容**:

```
┌─────────────────────────────────────────────────────┐
│  Header                                             │
│  [🔵 Clone Repository]  (ハイライト)               │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐  │
│  │ [半透明オーバーレイ]                         │  │
│  │                                              │  │
│  │            📦 セットアップ                    │  │
│  │                                              │  │
│  │        ① リポジトリクローン  👈              │  │
│  │        ② 認証設定                            │  │
│  │        ③ タスク作成                          │  │
│  │                                              │  │
│  │        👆 Clone Repository                   │  │
│  │                                              │  │
│  └──────────────────────────────────────────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐                 │
│  │Backlog │ │Planning│ │Tasking │ ...             │
│  └────────┘ └────────┘ └────────┘                 │
└─────────────────────────────────────────────────────┘
```

**実装例**:

```tsx
function RepositoryOnboardingOverlay() {
  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-8 shadow-2xl max-w-xs text-center">
        <div className="text-5xl mb-4">📦</div>
        <h2 className="text-xl font-bold mb-6">セットアップ</h2>

        <div className="space-y-2 mb-6 text-sm">
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded border-2 border-blue-500">
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">
              1
            </span>
            <span className="font-semibold text-blue-900">リポジトリクローン</span>
            <span className="ml-auto">👈</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
            <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center">
              2
            </span>
            <span>認証設定</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
            <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center">
              3
            </span>
            <span>タスク作成</span>
          </div>
        </div>

        <div className="text-xs text-blue-600">👆 Clone Repository</div>
      </div>
    </div>
  );
}

function KanbanPage() {
  const onboardingState = useOnboardingState();

  return (
    <div className="h-screen flex flex-col">
      <Header
        {...headerProps}
        nextStep={onboardingState.nextStep} // Headerボタンをハイライト
      />

      {/* カンバンボードは常に表示（リポジトリ未登録時も） */}
      <div className="relative flex-1">
        <KanbanBoard
          tasks={tasks}
          onTaskMove={handleTaskMove}
          isEmpty={onboardingState.nextStep === 'task'}
          onAddTaskClick={() => openAddTaskDialog()}
        />

        {/* リポジトリ未登録時のオーバーレイ（説明のみ） */}
        {onboardingState.nextStep === 'clone' && <RepositoryOnboardingOverlay />}
      </div>
    </div>
  );
}
```

**スタイルのポイント**:

- `absolute inset-0`: 全画面オーバーレイ
- `bg-black/50`: 半透明の黒背景
- `backdrop-blur-sm`: 背景のぼかし効果
- `z-50`: カンバンボードより前面に表示
- カンバンボードは通常通り表示されているが、操作不可

**Header ハイライト**:

```tsx
// Headerの "Clone Repository" ボタンをハイライト
<button
  onClick={onCloneClick}
  className={`px-4 py-2 rounded ${
    nextStep === 'clone'
      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-300 animate-pulse'
      : 'bg-gray-200'
  }`}
>
  Clone Repository
</button>
```

---

### 2. 環境変数未設定時

**表示内容**:

```
┌─────────────────────────────────────────────────────┐
│  Header                                             │
│  [⚙️ Settings]  (ハイライト)                        │
├─────────────────────────────────────────────────────┤
│  ⚠️ 必要なトークンを設定してください 👆 Settings   │
├─────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐                  │
│  │Backlog │ │Planning│ │Tasking │ ...              │
│  └────────┘ └────────┘ └────────┘                  │
└─────────────────────────────────────────────────────┘
```

**実装例**:

```tsx
function EnvironmentNotification() {
  const { hasAnthropicApiKey, hasClaudeCodeToken } = useOnboardingState();

  if (hasAnthropicApiKey && hasClaudeCodeToken) return null;

  return (
    <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200">
      <div className="mx-6 py-2 flex items-center justify-center gap-2 text-sm text-amber-900">
        <span>⚠️</span>
        <span>必要なトークンを設定してください</span>
        <span className="text-xs">👆 Settings</span>
      </div>
    </div>
  );
}
```

**スタイルのポイント**:

- `sticky top-0`: スクロールしても上部に固定
- `z-40`: オーバーレイより下、カンバンボードより上
- 最小限の高さ・パディングで画面を圧迫しない
- Dismissボタンなし（設定完了まで表示し続ける）

**Header ハイライト**:

```tsx
<button
  onClick={onSettingsClick}
  className={`px-4 py-2 rounded ${
    nextStep === 'env'
      ? 'bg-amber-500 text-white shadow-lg ring-4 ring-amber-300 animate-pulse'
      : 'bg-gray-200'
  }`}
>
  ⚙️ Settings
</button>
```

**配色の変更理由**:

- `yellow` → `amber`: より落ち着いた警告色（Material Design推奨）
- より視認性が高く、警告として適切

---

### 3. タスク未作成時

**表示内容**:

```
┌─────────────────────────────────────────────────────┐
│  Header                                             │
│  [+ Add Task]  (ハイライト)                         │
├─────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   Todo    │  │In Progress│  │   Done    │       │
│  │           │  │           │  │           │       │
│  │  📝       │  │           │  │           │       │
│  │  最初の   │  │           │  │           │       │
│  │  タスクを │  │           │  │           │       │
│  │  作成     │  │           │  │           │       │
│  │  [+ Add]  │  │           │  │           │       │
│  │           │  │           │  │           │       │
│  └───────────┘  └───────────┘  └───────────┘       │
└─────────────────────────────────────────────────────┘
```

**実装例**:

```tsx
function EmptyTaskState({ onAddTaskClick }: Props) {
  return (
    <div className="flex items-center justify-center p-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">📝</div>
        <h3 className="text-xl font-semibold mb-2">タスクがありません</h3>
        <p className="text-gray-600 mb-6">
          最初のタスクを作成して
          <br />
          Claudeに開発を依頼しましょう
        </p>
        <button
          onClick={onAddTaskClick}
          className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-600 transition-colors animate-pulse"
        >
          + 最初のタスクを作成
        </button>
      </div>
    </div>
  );
}

function KanbanColumn({ title, status, tasks, onAddTaskClick, isEmpty }: Props) {
  return (
    <div className="flex-shrink-0 w-64 flex flex-col bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-gray-500">{tasks.length}</span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
          >
            {tasks.length === 0 && isEmpty && status === 'backlog' ? (
              <EmptyTaskState onAddTaskClick={onAddTaskClick} />
            ) : (
              <div className="space-y-2">
                {tasks.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <TaskCard task={task} isDragging={snapshot.isDragging} />
                      </div>
                    )}
                  </Draggable>
                ))}
              </div>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
```

**Header ハイライト**:

```tsx
<button
  onClick={onAddTaskClick}
  className={`px-4 py-2 rounded ${
    nextStep === 'task'
      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-300 animate-pulse'
      : 'bg-blue-500 text-white'
  }`}
>
  + Add Task
</button>
```

---

### 4. 通常状態（すべて完了）

**表示内容**: 通常のKanban board、ハイライトなし

---

## チュートリアルダイアログ（将来拡張）

初回ユーザー向けに、より詳細なチュートリアルダイアログを表示することも検討：

```tsx
function OnboardingTutorial({ step, onNext, onSkip }: Props) {
  const tutorials = [
    {
      title: 'リポジトリをクローン',
      description:
        'まずは開発したいGitリポジトリをクローンしましょう。HTTPSまたはSSH URLを入力してください。',
      action: 'Clone Repository',
    },
    {
      title: '環境変数を設定',
      description:
        'Claude APIを利用するための認証トークンを設定します。ANTHROPIC_API_KEYとCLAUDE_CODE_OAUTH_TOKENが必要です。',
      action: 'Open Settings',
    },
    {
      title: 'タスクを作成',
      description:
        'Claudeに依頼したい開発タスクを作成します。タイトル、ブランチ名、実装内容を指定してください。',
      action: 'Create Task',
    },
  ];

  // チュートリアルダイアログUI...
}
```

---

## レイアウト

### 全体構造

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Header (Logo, Filters, Actions)                                                     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                             │
│  │Backlog │ │Planning│ │Coding  │ │Reviewing│ │ Done   │                             │
│  │        │ │        │ │        │ │        │ │        │                             │
│  │┌──────┐│ │┌──────┐│ │┌──────┐│ │┌──────┐│ │┌──────┐│                             │
│  ││Task1 ││ ││Task3 ││ ││Task5 ││ ││Task7 ││ ││Task9 ││                             │
│  │└──────┘│ │└──────┘│ │└──────┘│ │└──────┘│ │└──────┘│                             │
│  │        │ │        │ │        │ │        │ │        │                             │
│  │┌──────┐│ │┌──────┐│ │┌──────┐│ │┌──────┐│ │        │                             │
│  ││Task2 ││ ││Task4 ││ ││Task6 ││ ││Task8 ││ │        │                             │
│  │└──────┘│ │└──────┘│ │└──────┘│ │└──────┘│ │        │                             │
│  │        │ │        │ │        │ │        │ │        │                             │
│  │  ...   │ │  ...   │ │  ...   │ │  ...   │ │  ...   │                             │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘                             │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Header

### 要素

#### Logo

- **位置**: 左端
- **内容**: "Tsunagi" テキスト
- **スタイル**: 太字、大きめのフォント

#### Filters

- **位置**: 中央
- **機能**:
  - Ownerフィルター（ドロップダウン）
  - Repoフィルター（ドロップダウン）
  - 検索ボックス（タイトル・説明文を検索）

#### Actions

- **位置**: 右端
- **ボタン**:
  - "Clone Repository" - リポジトリクローンダイアログを開く
  - "Reload" - データ再読み込み
  - "+ Add Task" - タスク作成ダイアログを開く
  - "Settings" - 環境変数設定画面を開く

**ハイライト表示**: 初回ユーザーフローの状態に応じて、次に必要なボタンがハイライトされます。

### 実装例

```tsx
function Header({ onCloneClick, onAddTaskClick, onSettingsClick, onReload, nextStep }: Props) {
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [repoFilter, setRepoFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ボタンハイライト用のスタイル関数
  const getButtonStyle = (step: string) => {
    const isHighlighted = nextStep === step;
    const baseStyle = 'px-4 py-2 rounded font-semibold transition-all';

    if (isHighlighted) {
      return `${baseStyle} bg-blue-500 text-white shadow-lg ring-4 ring-blue-300 animate-pulse`;
    }

    return `${baseStyle} bg-gray-200 hover:bg-gray-300`;
  };

  return (
    <header className="h-16 border-b flex items-center justify-between px-6">
      {/* Logo */}
      <h1 className="text-2xl font-bold">Tsunagi</h1>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="px-3 py-1.5 border rounded"
        >
          <option value="">All Owners</option>
          {/* オプション */}
        </select>

        <select
          value={repoFilter}
          onChange={(e) => setRepoFilter(e.target.value)}
          className="px-3 py-1.5 border rounded"
        >
          <option value="">All Repos</option>
          {/* オプション */}
        </select>

        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 border rounded w-64"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onCloneClick} className={getButtonStyle('clone')} title="Clone Repository">
          Clone Repository
        </button>

        <button onClick={onReload} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
          Reload
        </button>

        <button onClick={onAddTaskClick} className={getButtonStyle('task')}>
          + Add Task
        </button>

        <button
          onClick={onSettingsClick}
          className={getButtonStyle('env')}
          title="Environment Settings"
        >
          ⚙️ Settings
        </button>
      </div>
    </header>
  );
}
```

---

## 統合実装例（初回ユーザーフロー対応）

```tsx
import { useState, useEffect, useMemo } from 'react';

function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [globalEnv, setGlobalEnv] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 初回ユーザーフローの状態を検出
  const onboardingState = useMemo(() => {
    const state = {
      hasRepositories: repositories.length > 0,
      hasAnthropicApiKey: Boolean(globalEnv.ANTHROPIC_API_KEY),
      hasClaudeCodeToken: Boolean(globalEnv.CLAUDE_CODE_OAUTH_TOKEN),
      hasTasks: tasks.length > 0,
    };

    let nextStep: 'clone' | 'env' | 'task' | 'complete';

    if (!state.hasRepositories) {
      nextStep = 'clone';
    } else if (!state.hasAnthropicApiKey || !state.hasClaudeCodeToken) {
      nextStep = 'env';
    } else if (!state.hasTasks) {
      nextStep = 'task';
    } else {
      nextStep = 'complete';
    }

    return { state, nextStep };
  }, [repositories, globalEnv, tasks]);

  // 初回データロード
  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then((r) => r.json()), // デフォルトで deleted=false のタスクのみ取得
      fetch('/api/owners').then((r) => r.json()),
      fetch('/api/env').then((r) => r.json()),
    ])
      .then(([tasksData, ownersData, envData]) => {
        setTasks(tasksData.data.tasks); // 削除済みタスクは含まれない
        // ownersからすべてのリポジトリを抽出
        const allRepos = ownersData.data.owners.flatMap((o) => o.repositories);
        setRepositories(allRepos);
        setGlobalEnv(envData.data.env);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // WebSocket イベントハンドラ（省略）
  // ...

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        onCloneClick={() => openCloneDialog()}
        onAddTaskClick={() => openAddTaskDialog()}
        onSettingsClick={() => openSettingsDialog()}
        onReload={() => reloadData()}
        nextStep={onboardingState.nextStep}
      />

      {/* 環境変数未設定時の通知バナー（Dismissできない） */}
      <EnvironmentNotification />

      {/* カンバンボード（常に表示） */}
      <div className="relative flex-1">
        <KanbanBoard
          tasks={tasks}
          onTaskMove={handleTaskMove}
          isEmpty={onboardingState.nextStep === 'task'}
          onAddTaskClick={() => openAddTaskDialog()}
        />

        {/* リポジトリ未登録時の半透明オーバーレイ */}
        {onboardingState.nextStep === 'clone' && (
          <RepositoryOnboardingOverlay onCloneClick={() => openCloneDialog()} />
        )}
      </div>
    </div>
  );
}
```

---

## Kanban Board

### カラム構成

Tsunagiでは、タスクの進行状態を5つのカラムで管理します：

| カラム        | status値    | 説明                   | plan フィールド      | 成果物                     |
| ------------- | ----------- | ---------------------- | -------------------- | -------------------------- |
| **Backlog**   | `backlog`   | タスク作成済み、未着手 | 入力不可 (null)      | タスク定義                 |
| **Planning**  | `planning`  | 計画・仕様作成中       | 作成中/済 (not null) | 作業計画、仕様書           |
| **Coding**    | `coding`    | 実装中                 | 使用して実装         | ソースコード               |
| **Reviewing** | `reviewing` | レビュー・修正中       | 参照                 | テスト結果、PRレビュー対応 |
| **Done**      | `done`      | 完了（PRマージ完了）   | -                    | マージされたコード         |

**表示対象**: 削除されていないタスク（`deleted: false`）のみ表示されます。削除済みタスク（`deleted: true`）はKanban boardには表示されませんが、API経由で検索・閲覧可能です。

#### スタイル

- **幅**: 各カラム固定最小幅256px（`min-w-64`）、画面に収まらない場合は横スクロール
- **高さ**: ヘッダーを除いた残り全体（`h-[calc(100vh-64px)]`）
- **カラム内スクロール**: タスク一覧部分は `overflow-y-auto` で縦スクロール
- **背景色**: 薄いグレー
- **パディング**: 上下左右に適度な余白

### 実装例

```tsx
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

function KanbanBoard({ tasks, onTaskMove, isEmpty, onAddTaskClick }: Props) {
  // タスクソート: 人間タスク（上）→ Claude実行中タスク（下、グレーアウト）、それぞれ order 昇順
  const sortTasks = (a: Task, b: Task) => {
    const aIsClaudeRunning = a.claudeState === 'running';
    const bIsClaudeRunning = b.claudeState === 'running';

    // Claude実行中タスクは下に配置
    if (aIsClaudeRunning !== bIsClaudeRunning) {
      return aIsClaudeRunning ? 1 : -1;
    }

    // 同じグループ内では order 順（undefined は最後）
    if (a.order === undefined && b.order === undefined) return 0;
    if (a.order === undefined) return 1;
    if (b.order === undefined) return -1;
    return a.order - b.order;
  };

  const backlogTasks = tasks.filter((t) => t.status === 'backlog').sort(sortTasks);
  const planningTasks = tasks.filter((t) => t.status === 'planning').sort(sortTasks);
  const codingTasks = tasks.filter((t) => t.status === 'coding').sort(sortTasks);
  const reviewingTasks = tasks.filter((t) => t.status === 'reviewing').sort(sortTasks);
  const doneTasks = tasks.filter((t) => t.status === 'done').sort(sortTasks);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId) {
      // 同じカラム内での移動（順序変更）
      return;
    }

    // ステータス更新
    const newStatus = destination.droppableId as Task['status'];
    onTaskMove(draggableId, newStatus);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex-1 flex gap-4 p-6 overflow-x-auto">
        <KanbanColumn
          title="Backlog"
          status="backlog"
          tasks={backlogTasks}
          isEmpty={isEmpty}
          onAddTaskClick={onAddTaskClick}
        />
        <KanbanColumn title="Planning" status="planning" tasks={planningTasks} />
        <KanbanColumn title="Coding" status="coding" tasks={codingTasks} />
        <KanbanColumn title="Reviewing" status="reviewing" tasks={reviewingTasks} />
        <KanbanColumn title="Done" status="done" tasks={doneTasks} />
      </div>
    </DragDropContext>
  );
}
```

---

## Kanban Column

### 構造

```tsx
function KanbanColumn({ title, status, tasks }: Props) {
  return (
    <div className="min-w-64 flex flex-col bg-gray-50 rounded-lg p-4 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-gray-500">{tasks.length}</span>
      </div>

      {/* タスクリスト（縦スクロール） */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2 overflow-y-auto ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TaskCard task={task} isDragging={snapshot.isDragging} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
```

---

## Task Card

### 表示内容

- **タイトル**: タスクのタイトル（太字）
- **Order**: 実行順序バッジ（小さい値ほど高優先度）
- **Owner/Repo/Branch**: `owner/repo @ branch` 形式で表示
- **Claude実行状態**: アイコンで表示
  - 🔵 running（青、アニメーション）: Claude実行中
  - 🟢 idle + completed（緑）: 成功完了
  - 🔴 idle + failed（赤）: 失敗
  - ⚫ idle + paused/cancelled（グレー）: 中断
  - ⚪ idle + セッションなし（白/グレー）: 未実行
- **Effort**: 工数見積もり（例: 2.5h）

### スタイル

- 背景色: 白
- ボーダー: 薄いグレー
- ホバー時: 薄い影をつける
- ドラッグ中: 強い影、少し回転

### 実装例

```tsx
function TaskCard({ task, latestSession, isDragging }: Props) {
  // Claude実行状態のアイコン判定
  const getStateIcon = () => {
    if (task.claudeState === 'running') return '🔵'; // 実行中
    if (!latestSession) return '⚪'; // 未実行
    if (latestSession.status === 'completed') return '🟢'; // 成功
    if (latestSession.status === 'failed') return '🔴'; // 失敗
    return '⚫'; // 中断/キャンセル
  };

  const stateIcon = getStateIcon();
  const isClaudeRunning = task.claudeState === 'running';

  return (
    <div
      className={`
        bg-white border rounded-lg p-4 cursor-pointer
        hover:shadow-md transition-shadow
        ${isDragging ? 'shadow-xl rotate-2' : ''}
        ${isClaudeRunning ? 'opacity-50 bg-gray-50' : ''}
      `}
      onClick={() => onTaskClick(task.id)}
    >
      {/* Order Badge */}
      {task.order !== undefined && (
        <div
          className={`inline-block px-2 py-0.5 text-xs font-medium rounded mb-2 ${
            isClaudeRunning ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
          }`}
        >
          #{task.order}
        </div>
      )}

      {/* タイトル */}
      <h3 className={`font-semibold mb-2 ${isClaudeRunning ? 'text-gray-500' : 'text-gray-900'}`}>
        {task.title}
      </h3>

      {/* Owner/Repo/Branch */}
      <p className={`text-sm mb-2 ${isClaudeRunning ? 'text-gray-400' : 'text-gray-600'}`}>
        {task.owner}/{task.repo} @ {task.branch}
      </p>

      {/* Claude状態とメタ情報 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {stateIcon} {task.claudeState}
        </span>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          {/* 工数 */}
          {task.effort && <span className="font-medium">{task.effort}h</span>}

          {/* ログ数 */}
          {task.logs.length > 0 && <span>{task.logs.length} logs</span>}
        </div>
      </div>
    </div>
  );
}
```

---

## タスク作成ダイアログ

### 表示トリガー

- Header の "+ Add Task" ボタンをクリック
- タスク未作成時のEmpty Stateから「+ 最初のタスクを作成」ボタンをクリック
- 初回ユーザーの場合、ボタンがハイライト表示されている

### フォーム項目

| 項目        | 型       | 必須 | バリデーション                               |
| ----------- | -------- | ---- | -------------------------------------------- |
| Title       | text     | ✓    | 1-200文字                                    |
| Description | textarea | ✗    | MySQLのStringの上限くらい                    |
| Owner       | select   | ✓    | リポジトリ一覧から選択                       |
| Repo        | select   | ✓    | 選択したownerのリポジトリ                    |
| Branch      | text     | ✓    | 1-255文字(gitのブランチの制限をそのまま適用) |
| Prompt      | textarea | ✗    | Claudeへの初期指示                           |

### 実装例

```tsx
function AddTaskDialog({ isOpen, onClose, onAdd }: Props) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    owner: '',
    repo: '',
    branch: '',
    prompt: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      await onAdd(formData);
      onClose();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Add New Task</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              required
              maxLength={200}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              maxLength={5000}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded h-24"
            />
          </div>

          {/* Owner, Repo, Branch, Prompt... */}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## リポジトリクローンダイアログ

### 表示トリガー

- Header の "Clone Repository" ボタンをクリック
- 初回ユーザー（リポジトリ未登録時）の場合、ボタンがハイライト表示されている

### フォーム項目

| 項目       | 型       | 必須 | 説明                                   |
| ---------- | -------- | ---- | -------------------------------------- |
| Git URL    | text     | ✓    | HTTPS or SSH形式のGit URL              |
| Auth Token | password | ✗    | プライベートリポジトリ用の認証トークン |

### 実装例

```tsx
function CloneRepositoryDialog({ isOpen, onClose, onClone }: Props) {
  const [gitUrl, setGitUrl] = useState('');
  const [authToken, setAuthToken] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onClone({ gitUrl, authToken });
      onClose();
    } catch (error) {
      console.error('Failed to clone repository:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Clone Repository</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Git URL *</label>
            <input
              type="text"
              required
              placeholder="https://github.com/owner/repo.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              HTTPS or SSH形式のGit URLを入力してください
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Auth Token (Optional)</label>
            <input
              type="password"
              placeholder="ghp_xxx or oauth token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">プライベートリポジトリの場合に必要です</p>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
              Clone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## 環境変数設定ダイアログ

### 表示トリガー

- Header の "⚙️ Settings" ボタンをクリック
- 初回ユーザー（環境変数未設定時）の場合、ボタンがハイライト表示されている

### フォーム項目

| 項目                    | 型       | 必須 | 説明                        |
| ----------------------- | -------- | ---- | --------------------------- |
| ANTHROPIC_API_KEY       | password | ✓    | Claude API Key (sk-xxx形式) |
| CLAUDE_CODE_OAUTH_TOKEN | password | ✓    | Claude Code OAuth Token     |

### 実装例

```tsx
function EnvironmentSettingsDialog({ isOpen, onClose, onSave }: Props) {
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [claudeCodeToken, setClaudeCodeToken] = useState('');

  useEffect(() => {
    if (isOpen) {
      // 現在の環境変数をロード
      fetch('/api/env')
        .then((r) => r.json())
        .then((data) => {
          setAnthropicApiKey(data.data.env.ANTHROPIC_API_KEY || '');
          setClaudeCodeToken(data.data.env.CLAUDE_CODE_OAUTH_TOKEN || '');
        });
    }
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      // ANTHROPIC_API_KEY を設定
      await onSave('ANTHROPIC_API_KEY', anthropicApiKey);
      // CLAUDE_CODE_OAUTH_TOKEN を設定
      await onSave('CLAUDE_CODE_OAUTH_TOKEN', claudeCodeToken);
      onClose();
      toast.success('環境変数を設定しました');
    } catch (error) {
      console.error('Failed to save environment variables:', error);
      toast.error('環境変数の設定に失敗しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Environment Settings</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">ANTHROPIC_API_KEY *</label>
            <input
              type="password"
              required
              placeholder="sk-ant-xxx"
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              className="w-full px-3 py-2 border rounded font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Claude APIキー（
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                className="text-blue-500 underline"
              >
                console.anthropic.com
              </a>{' '}
              から取得）
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">CLAUDE_CODE_OAUTH_TOKEN *</label>
            <input
              type="password"
              required
              placeholder="oauth_xxx"
              value={claudeCodeToken}
              onChange={(e) => setClaudeCodeToken(e.target.value)}
              className="w-full px-3 py-2 border rounded font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Claude Code OAuth Token（
              <a
                href="https://claude.ai/settings/developer"
                target="_blank"
                className="text-blue-500 underline"
              >
                claude.ai/settings/developer
              </a>{' '}
              から取得）
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### サービス別環境変数プリセット（将来拡張）

**設計方針**: サービスごとの規定環境変数を簡単に設定できるUIを提供

**サポート予定サービス**:

| サービス         | 環境変数名                     | 説明                           |
| ---------------- | ------------------------------ | ------------------------------ |
| **Claude API**   | `ANTHROPIC_API_KEY`            | Claude APIキー（`sk-ant-xxx`） |
| **Claude OAuth** | `CLAUDE_CODE_OAUTH_TOKEN`      | Claude Code OAuth Token        |
| **GitHub**       | `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub PAT（ghコマンド用）     |
| **その他**       | カスタム                       | 任意の環境変数名・値           |

**UI設計案**:

```tsx
function EnvironmentSettingsDialogEnhanced({ isOpen, onClose, onSave }: Props) {
  const [selectedService, setSelectedService] = useState<string>('');
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  const servicePresets = [
    { id: 'claude-api', name: 'Claude API', vars: ['ANTHROPIC_API_KEY'] },
    { id: 'claude-oauth', name: 'Claude OAuth', vars: ['CLAUDE_CODE_OAUTH_TOKEN'] },
    { id: 'github', name: 'GitHub', vars: ['GITHUB_PERSONAL_ACCESS_TOKEN'] },
    { id: 'custom', name: 'カスタム', vars: [] },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">環境変数設定</h2>

        {/* サービス選択 */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">サービス選択</label>
          <div className="grid grid-cols-2 gap-2">
            {servicePresets.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => setSelectedService(service.id)}
                className={`px-3 py-2 border rounded text-sm ${
                  selectedService === service.id
                    ? 'bg-blue-50 border-blue-500 text-blue-900'
                    : 'bg-white border-gray-300'
                }`}
              >
                {service.name}
              </button>
            ))}
          </div>
        </div>

        {/* 環境変数入力フォーム（選択されたサービスに応じて動的生成） */}
        <form className="space-y-3">{/* 動的フォーム */}</form>
      </div>
    </div>
  );
}
```

**メリット**:

- ✅ サービス名で検索・選択できる
- ✅ 環境変数名を覚える必要がない
- ✅ 設定ミスが減る
- ✅ 将来的にサービス追加が容易

---

## フィルタリング・検索

### フィルタリング

タスクをownerまたはrepoでフィルタリング：

```tsx
const filteredTasks = useMemo(() => {
  return tasks.filter((task) => {
    if (ownerFilter && task.owner !== ownerFilter) return false;
    if (repoFilter && task.repo !== repoFilter) return false;
    return true;
  });
}, [tasks, ownerFilter, repoFilter]);
```

### 検索

タイトルまたは説明文で検索：

```tsx
const searchedTasks = useMemo(() => {
  if (!searchQuery) return filteredTasks;

  const query = searchQuery.toLowerCase();

  return filteredTasks.filter((task) => {
    return (
      task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query)
    );
  });
}, [filteredTasks, searchQuery]);
```

---

## ソート

### タスクの自動ソート

各カラム内のタスクは以下のルールで自動的にソートされます：

**優先順位**:

1. **人間タスク（上）**: Claude実行中でないタスク
2. **Claude実行中タスク（下、グレーアウト）**: `claudeState === 'running'`

それぞれのグループ内で `order` 昇順にソート:

- **昇順**: 小さい `order` 値が上に表示（order 0 が最優先）
- **未設定タスク**: `order` が `undefined` のタスクは最後に表示

```tsx
const sortTasks = (a: Task, b: Task) => {
  const aIsClaudeRunning = a.claudeState === 'running';
  const bIsClaudeRunning = b.claudeState === 'running';

  // Claude実行中タスクは下に配置
  if (aIsClaudeRunning !== bIsClaudeRunning) {
    return aIsClaudeRunning ? 1 : -1;
  }

  // 同じグループ内では order 順（undefined は最後）
  if (a.order === undefined && b.order === undefined) return 0;
  if (a.order === undefined) return 1;
  if (b.order === undefined) return -1;
  return a.order - b.order;
};

// 各カラムでソート適用
const backlogTasks = tasks.filter((t) => t.status === 'backlog').sort(sortTasks);
```

### 表示例

```
Backlog カラム:
┌─────────────────────┐
│ #0  Task A          │  ← 人間タスク: order 0（最優先）
├─────────────────────┤
│ #1  Task B          │  ← 人間タスク: order 1
├─────────────────────┤
│     Task C          │  ← 人間タスク: order undefined
├─────────────────────┤
│ #2  Task D (薄い表示)│  ← Claude実行中: order 2（グレーアウト）
├─────────────────────┤
│ #5  Task E (薄い表示)│  ← Claude実行中: order 5（グレーアウト）
└─────────────────────┘
```

**設計意図**:

- Claude実行中のタスクは人間が考える必要がないため、下に配置してグレーアウト
- 人間が次に取り組むべきタスクが常に上部に表示される

---

## インタラクション

### タスクカードクリック

- タスク詳細パネルを開く
- タスク詳細は別ドキュメント参照: [task-detail.md](./task-detail.md)

### ドラッグ&ドロップ

- タスクカードをドラッグしてカラム間を移動
- ドロップ時に `PUT /api/tasks/[id]` でステータスを更新

### リロード

- Headerの "Reload" ボタンでタスク一覧を再取得
- `GET /api/tasks` を実行

---

## レスポンシブデザイン

### 基本設計

- **各カラム**: 最小幅256px（`min-w-64`）
- **カラム高さ**: ヘッダー除いた残り全体（`h-[calc(100vh-64px)]`）
- **カラム内スクロール**: タスク一覧は `overflow-y-auto` で縦スクロール
- **横スクロール**: 画面幅に収まらない場合は自動的に横スクロール有効

### デスクトップ（1536px以上）

- 6カラムすべて表示（6 × 256px = 1536px）
- 横スクロールなし（すべて画面内に収まる）

### ラップトップ（1024px-1535px）

- 6カラム表示
- 横スクロール必須（画面幅に収まらない）

### タブレット（768px-1023px）

- 6カラム表示
- 横スクロール必須
- スワイプでスクロール

### モバイル（768px未満）

- 6カラム表示
- 横スクロール必須
- または縦スクロール設計に変更（各カラムが画面幅100%）
- ドラッグ&ドロップは無効化（タップでステータス変更ドロップダウン）

---

## パフォーマンス最適化

### 仮想化（将来）

タスク数が多い場合、react-windowで仮想化：

```tsx
import { FixedSizeList } from 'react-window';

function VirtualizedTaskList({ tasks }: Props) {
  return (
    <FixedSizeList height={600} itemCount={tasks.length} itemSize={100} width="100%">
      {({ index, style }) => (
        <div style={style}>
          <TaskCard task={tasks[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### メモ化

タスクカードをReact.memoで最適化：

```tsx
const TaskCard = React.memo(({ task, isDragging }: Props) => {
  // ...
});
```

---

## アクセシビリティ

- キーボードナビゲーション対応
- スクリーンリーダー対応（aria-label）
- フォーカス表示の明確化

---

## 初回ユーザーフローまとめ

### フロー全体図

```
起動
 ↓
[リポジトリ有？] No → Clone Repository Dialog (ハイライト)
 ↓ Yes
[環境変数設定済？] No → Environment Settings Dialog (ハイライト)
 ↓ Yes
[タスク有？] No → Add Task Dialog (ハイライト)
 ↓ Yes
通常のKanban Board表示
 ↓
タスク作成（Backlog）
 ↓
要件定義・仕様作成（Planning）
 ↓
実装計画作成（Tasking）
 ↓
実装（Coding）
 ↓
動作確認（Reviewing）
 ↓
完了（Done）
```

### 状態遷移表

| 状態 | リポジトリ | 環境変数 | タスク | 表示内容                      | ハイライトボタン |
| ---- | ---------- | -------- | ------ | ----------------------------- | ---------------- |
| 1    | ✗          | -        | -      | Empty Repository State        | Clone Repository |
| 2    | ✓          | ✗        | -      | Warning Banner + Empty Board  | Settings         |
| 3    | ✓          | ✓        | ✗      | Empty Task State in Backlog   | + Add Task       |
| 4    | ✓          | ✓        | ✓      | 通常のKanban Board（6カラム） | なし             |

### 初回ユーザー体験の設計意図

1. **段階的な誘導**: ユーザーが次に何をすべきかを明確に示す
2. **視覚的なハイライト**: ボタンのアニメーションとリングで注目を集める
3. **説明的なEmpty State**: 空の状態でも次のアクションを促す
4. **シンプルな優先順位**: 最も重要なステップから順に誘導
5. **スキップ可能**: 強制ではなく、ユーザーが自由に操作できる

これにより、初めてTsunagiを使うユーザーでも迷わずに開発を始められます。
