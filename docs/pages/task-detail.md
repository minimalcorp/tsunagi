# Task Detail UI仕様

タスク詳細パネルの仕様について説明します。タスクの詳細情報の表示、編集、Claude実行、ログ表示などを行います。

---

## 概要

Task Detailは、選択されたタスクの詳細情報を表示・編集するパネルです。タスクを選択すると全画面で表示されます。

タスクに集中するため、ヘッダなどの共通レイアウトは非表示となり、タスク詳細のみが表示されます。

---

## レイアウト

### デスクトップ（全画面表示）

```
┌──────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────┐  │
│  │ Info (タスク情報)                              │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Session Tabs [Session 1] [Session 2] [+]      │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ View Toggle: [⚌ Split] [◧ Editor] [≡ Logs]   │  │
│  └────────────────────────────────────────────────┘  │
│  ┌──────────────────────┬─────────────────────────┐  │
│  │                      │                         │  │
│  │  Monaco Editor       │  Logs (Chat UI)         │  │
│  │  (Prompt Input)      │  - User messages        │  │
│  │                      │  - Claude responses     │  │
│  │                      │  - Tool uses            │  │
│  │                      │                         │  │
│  │                      │                         │  │
│  └──────────────────────┴─────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Actions (Quick Actions)                        │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### モバイル（全画面表示）

モバイルでも同様の全画面表示。中段は縦スタック（Editor上、Logs下）で表示。

---

## データモデル

### ClaudeSession

```typescript
interface ClaudeSession {
  id: string;
  taskId: string;
  name: string; // "Session 1", "Session 2", etc.
  prompt: string; // Monaco Editorの現在のコンテンツ
  claudeState: 'idle' | 'waiting' | 'running' | 'stopped' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
```

### ChatMessage

```typescript
interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'error';
  content: string;
  toolName?: string; // role='tool'の場合のみ
  timestamp: Date;
}
```

---

## セクション構成

### 0. 共通レイアウトの非表示

タスク詳細画面では、ヘッダやサイドバーなどの共通レイアウトを非表示にし、タスクに集中できるようにします。

画面左上に「← Back to Board」ボタンを配置し、Kanban Boardに戻れるようにします。

---

### 1. Task Information

タスクの基本情報を表示・編集

#### 表示項目

- **Title**: タスクタイトル（編集可能）
- **Description**: 説明文（編集可能、Markdownサポート予定）
- **Plan**: 実行計画（編集可能、Markdownサポート予定）
- **Status**: ステータス（ドロップダウンで変更可能）
- **Owner/Repo**: `owner/repo` 形式で表示（読み取り専用）
- **Branch**: ブランチ名（読み取り専用）
- **Effort**: 工数（時間単位、編集可能）
- **Order**: 実行順序（0, 1, 2, ...、編集可能）
- **Claude State**: Claude実行状態（アイコン付き）
- **Created At**: 作成日時
- **Updated At**: 更新日時

#### 実装例

```tsx
function TaskInfo({ task, onUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description,
    plan: task.plan,
    status: task.status,
  });

  const handleSave = async () => {
    await onUpdate(task.id, formData);
    setIsEditing(false);
  };

  return (
    <div className="border-b pb-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Task Information</h2>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="text-blue-500">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} className="text-blue-500">
              Save
            </button>
            <button onClick={() => setIsEditing(false)} className="text-gray-500">
              Cancel
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded h-24"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <textarea
              value={formData.plan ?? ''}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value || undefined })}
              className="w-full px-3 py-2 border rounded h-32"
              placeholder="実行計画を記述してください..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as Task['status'] })
              }
              className="w-full px-3 py-2 border rounded"
            >
              <option value="todo">Todo</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Effort (hours)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="40"
              value={formData.effort ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, effort: parseFloat(e.target.value) || undefined })
              }
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g. 2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Order</label>
            <input
              type="number"
              min="0"
              value={formData.order ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, order: parseInt(e.target.value) || undefined })
              }
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g. 0 (highest priority)"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Title:</span> {task.title}
          </div>
          <div>
            <span className="font-medium">Description:</span> {task.description || 'N/A'}
          </div>
          <div>
            <span className="font-medium">Plan:</span>
            <pre className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
              {task.plan || 'No plan yet'}
            </pre>
          </div>
          <div>
            <span className="font-medium">Status:</span>{' '}
            <span className="capitalize">{task.status}</span>
          </div>
          <div>
            <span className="font-medium">Repository:</span> {task.owner}/{task.repo}
          </div>
          <div>
            <span className="font-medium">Branch:</span> {task.branch}
          </div>
          <div>
            <span className="font-medium">Effort:</span>{' '}
            {task.effort ? `${task.effort}h` : 'Not estimated'}
          </div>
          <div>
            <span className="font-medium">Order:</span>{' '}
            {task.order !== undefined ? task.order : 'Not set'}
          </div>
          <div>
            <span className="font-medium">Claude State:</span> {task.claudeState}
          </div>
          <div className="text-xs text-gray-500">
            Created: {new Date(task.createdAt).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            Updated: {new Date(task.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### 2. Session Management

1つのタスクに対して複数のClaude Sessionを作成・管理できます。

#### 表示項目

- **Session Tabs**: セッションタブのリスト
  - タブラベル: "Session 1", "Session 2", ...
  - アクティブタブのハイライト表示
  - 各タブに閉じるボタン（×）
- **New Session Button (+)**: 新しいセッションを作成

#### 実装例

```tsx
interface ClaudeSession {
  id: string;
  taskId: string;
  name: string; // "Session 1", "Session 2", etc.
  prompt: string;
  logs: LogEntry[];
  createdAt: Date;
  updatedAt: Date;
}

function SessionTabs({
  taskId,
  sessions,
  activeSessionId,
  onSessionChange,
  onSessionCreate,
  onSessionDelete,
}: Props) {
  return (
    <div className="flex items-center gap-2 border-b pb-2 mb-4 overflow-x-auto">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-t-lg cursor-pointer
            ${
              activeSessionId === session.id
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 hover:bg-gray-300'
            }
          `}
        >
          <button onClick={() => onSessionChange(session.id)} className="font-medium">
            {session.name}
          </button>
          {sessions.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete ${session.name}?`)) {
                  onSessionDelete(session.id);
                }
              }}
              className="text-sm hover:text-red-600"
            >
              ×
            </button>
          )}
        </div>
      ))}

      <button
        onClick={onSessionCreate}
        className="px-4 py-2 bg-green-500 text-white rounded-t-lg hover:bg-green-600"
        title="Create new session"
      >
        + New Session
      </button>
    </div>
  );
}
```

---

### 3. View Layout Toggle

中段のEditor/Logsエリアの表示モードを切り替えます。

#### 表示モード

- **Split (⚌)**: Editor + Logs を左右2分割で表示（デフォルト）
- **Editor Only (◧)**: Editorのみ全幅表示
- **Logs Only (≡)**: Logsのみ全幅表示

#### 実装例

```tsx
type ViewMode = 'split' | 'editor' | 'logs';

function ViewLayoutToggle({ mode, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 mb-4 p-2 bg-gray-100 rounded-lg">
      <span className="text-sm font-medium mr-2">View:</span>

      <button
        onClick={() => onChange('split')}
        className={`
          px-3 py-1 rounded transition-colors
          ${mode === 'split' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-200'}
        `}
        title="Split view"
      >
        ⚌ Split
      </button>

      <button
        onClick={() => onChange('editor')}
        className={`
          px-3 py-1 rounded transition-colors
          ${mode === 'editor' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-200'}
        `}
        title="Editor only"
      >
        ◧ Editor
      </button>

      <button
        onClick={() => onChange('logs')}
        className={`
          px-3 py-1 rounded transition-colors
          ${mode === 'logs' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-200'}
        `}
        title="Logs only"
      >
        ≡ Logs
      </button>
    </div>
  );
}
```

---

### 4. Claude Prompt (Monaco Editor)

Claudeへの指示をMonaco Editorで入力・実行します。

#### 表示項目

- **Monaco Editor**: プロンプト入力用のコードエディタ
  - シンタックスハイライト
  - 複数行編集
  - Markdown/プレーンテキストモード切り替え
- **Execute Button**: Claude実行ボタン
- **Stop Button**: 実行停止ボタン（実行中のみ表示）

#### 状態

- **idle**: プロンプト入力可能、Execute ボタン有効
- **running**: プロンプト入力可能、Execute/Stop ボタン両方表示
- **waiting**: プロンプト入力可能、Executeボタンは無効化、待機中表示

#### 実装例

```tsx
'use client';
import { Editor } from '@monaco-editor/react';
import { useState } from 'react';

function ClaudePromptEditor({ session, onExecute, onStop, onPromptChange }: Props) {
  const [prompt, setPrompt] = useState(session.prompt || '');

  const handleExecute = async () => {
    if (!prompt.trim()) return;
    await onExecute(session.id, prompt);
  };

  const handleEditorChange = (value: string | undefined) => {
    const newPrompt = value || '';
    setPrompt(newPrompt);
    onPromptChange(session.id, newPrompt);
  };

  const isRunning = session.claudeState === 'running';
  const isWaiting = session.claudeState === 'waiting';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Prompt</h3>
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={!prompt.trim() || isWaiting}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm disabled:opacity-50"
          >
            {isWaiting ? 'Waiting...' : '▶ Execute'}
          </button>

          {isRunning && (
            <button
              onClick={() => onStop(session.id)}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm"
            >
              ■ Stop
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 border rounded overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          value={prompt}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            fontSize: 14,
            scrollBeyondLastLine: false,
          }}
          theme="vs-light"
        />
      </div>

      {isRunning && (
        <div className="mt-2 flex items-center text-blue-600 text-sm">
          <span className="animate-pulse mr-2">●</span>
          Running...
        </div>
      )}
    </div>
  );
}
```

---

### 5. Execution Logs (Chat UI)

Claude実行ログを対話形式のChat UIでリアルタイム表示します。

#### 表示項目

- **Chat Messages**: メッセージのリスト
  - ユーザーメッセージ（送信したプロンプト）
  - Claudeメッセージ（応答）
  - Tool使用メッセージ
  - エラーメッセージ

#### スタイル

- **ユーザーメッセージ**: 右寄せ、青背景
- **Claudeメッセージ**: 左寄せ、灰色背景、Claudeアイコン付き
- **Tool使用メッセージ**: 左寄せ、緑背景、折りたたみ可能
- **エラーメッセージ**: 赤背景

#### 実装例

```tsx
'use client';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'error';
  content: string;
  toolName?: string; // for role='tool'
  timestamp: Date;
}

function ExecutionLogsChat({ session }: Props) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 新規メッセージ追加時に自動スクロール
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.logs]);

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold mb-2">Chat Logs</h3>

      <div className="flex-1 overflow-y-auto border rounded p-4 space-y-3 bg-gray-50">
        {session.logs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-8">
            No messages yet. Execute a prompt to start.
          </p>
        ) : (
          session.logs.map((message) => <ChatMessageItem key={message.id} message={message} />)
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
  const [isToolExpanded, setIsToolExpanded] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg p-3 bg-blue-500 text-white">
          <div className="text-xs opacity-80 mb-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          AI
        </div>
        <div className="max-w-[80%] rounded-lg p-3 bg-white border">
          <div className="text-xs text-gray-600 mb-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <div className="flex justify-start items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs flex-shrink-0">
          🔧
        </div>
        <div className="max-w-[80%] rounded-lg p-3 bg-green-50 border border-green-200">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-600">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
            <button
              onClick={() => setIsToolExpanded(!isToolExpanded)}
              className="text-xs text-green-700 hover:underline"
            >
              {isToolExpanded ? '▼ Hide' : '▶ Show'} {message.toolName}
            </button>
          </div>
          {isToolExpanded && (
            <pre className="text-xs bg-white p-2 rounded overflow-x-auto mt-2">
              {message.content}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'error') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-lg p-3 bg-red-100 border border-red-300">
          <div className="text-xs text-red-600 mb-1">
            Error - {new Date(message.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-sm text-red-800 whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  return null;
}
```

---

### 6. Quick Actions

タスクに関連するコマンドを素早くコピーするためのアクションボタン

#### Worktree Path

タスクのworktreeパスを表示：`~/.tsunagi/workspaces/{owner}/{repo}/{branch}`

#### ボタン

- **Open in VS Code**: `code {worktreePath}` コマンドをクリップボードにコピー
- **Open in Terminal**: `cd {worktreePath}` コマンドをクリップボードにコピー
- **Delete Task**: タスクを削除（確認ダイアログ付き、worktree/branchも自動削除）

#### 実装例

**CommandCopyButton コンポーネント**

```tsx
// src/components/CommandCopyButton.tsx
'use client';
import { useState } from 'react';

interface CommandCopyButtonProps {
  command: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary';
}

export default function CommandCopyButton({
  command,
  label,
  icon = '📋',
  variant = 'secondary',
}: CommandCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        px-4 py-2 rounded-lg font-medium text-sm transition-all
        ${
          variant === 'primary'
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
        }
        ${copied ? 'ring-2 ring-green-500' : ''}
      `}
      title={command}
    >
      {copied ? (
        <>✓ Copied!</>
      ) : (
        <>
          {icon} {label}
        </>
      )}
    </button>
  );
}
```

**TaskActions コンポーネント**

```tsx
function TaskActions({ task, onDelete }: Props) {
  const worktreePath = getWorktreePath(task);

  const handleDelete = async () => {
    if (confirm(`Delete task "${task.title}"?\n\nThis will also delete the worktree and branch.`)) {
      await onDelete(task.id);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>

      {/* Worktree Path */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-xs text-gray-600 mb-1">Worktree Path</div>
        <div className="font-mono text-sm text-gray-800 break-all">{worktreePath}</div>
      </div>

      {/* Command Copy Buttons */}
      <div className="space-y-2 mb-4">
        <CommandCopyButton
          command={`code ${worktreePath}`}
          label="Open in VS Code"
          icon="📝"
          variant="primary"
        />

        <CommandCopyButton command={`cd ${worktreePath}`} label="Open in Terminal" icon="💻" />
      </div>

      {/* Delete Button */}
      <button
        onClick={handleDelete}
        className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
      >
        🗑️ Delete Task (+ Worktree/Branch)
      </button>
    </div>
  );
}

// Helper function
function getWorktreePath(task: Task): string {
  const baseDir = process.env.NEXT_PUBLIC_TSUNAGI_WORKTREE_BASE || '~/.tsunagi/workspaces';
  return `${baseDir}/${task.owner}/${task.repo}/${task.branch}`;
}
```

#### 使用フロー

1. ユーザーがQuick Actionsセクションでボタンをクリック
2. 対応するコマンドがクリップボードにコピーされる
3. ボタンのラベルが一時的に「✓ Copied!」に変わる
4. ユーザーがホストマシンのターミナルでコマンドを貼り付け
5. コマンド実行（VS Code起動、ディレクトリ移動等）

---

### 7. 全体レイアウト統合

上記のセクションを統合したメインコンポーネントの実装例です。

```tsx
'use client';
import { useState } from 'react';

type ViewMode = 'split' | 'editor' | 'logs';

export default function TaskDetailPage({ taskId }: Props) {
  const [task, setTask] = useState<Task>(...);
  const [sessions, setSessions] = useState<ClaudeSession[]>(...);
  const [activeSessionId, setActiveSessionId] = useState(sessions[0]?.id);
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="min-h-screen bg-white">
      {/* Back Button */}
      <div className="p-4 border-b">
        <button
          onClick={() => router.push('/board')}
          className="text-blue-600 hover:underline"
        >
          ← Back to Board
        </button>
      </div>

      {/* Task Info */}
      <div className="p-4 border-b">
        <TaskInfo task={task} onUpdate={handleTaskUpdate} />
      </div>

      {/* Session Tabs */}
      <div className="p-4">
        <SessionTabs
          taskId={taskId}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionChange={setActiveSessionId}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
        />
      </div>

      {/* View Toggle */}
      <div className="px-4">
        <ViewLayoutToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Editor + Logs (Split or Single) */}
      <div className="p-4 flex-1">
        <div
          className={`
            h-[600px]
            ${viewMode === 'split' ? 'grid grid-cols-2 gap-4' : ''}
          `}
        >
          {(viewMode === 'split' || viewMode === 'editor') && (
            <ClaudePromptEditor
              session={activeSession}
              onExecute={handleExecute}
              onStop={handleStop}
              onPromptChange={handlePromptChange}
            />
          )}

          {(viewMode === 'split' || viewMode === 'logs') && (
            <ExecutionLogsChat session={activeSession} />
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t">
        <TaskActions task={task} onDelete={handleTaskDelete} />
      </div>
    </div>
  );
}
```

---

## インタラクション

### 開く

- Kanban boardでタスクカードをクリック
- デスクトップ: タスク詳細が全画面で表示される
- モバイル: タスク詳細が全画面で表示される

### 閉じる

- 「×」ボタンまたは「戻る」ボタンをクリック
- ESCキーを押す

### Claude実行

1. プロンプト入力
2. "Execute" ボタンをクリック
3. `POST /api/claude/execute` を呼び出し
4. `GET /api/claude/stream` でSSE接続
5. ログをリアルタイム表示

### Claude停止

1. "Stop" ボタンをクリック
2. `POST /api/claude/stop` を呼び出し

### Session管理

1. **新規セッション作成**: "+ New Session" ボタンをクリック
   - `POST /api/sessions` を呼び出し
   - 新しいセッションタブが追加される
2. **セッション切り替え**: セッションタブをクリック
   - アクティブセッションが切り替わる
   - Editor/Logsの内容が切り替わる
3. **セッション削除**: タブの「×」ボタンをクリック
   - 確認ダイアログ表示
   - `DELETE /api/sessions/:id` を呼び出し

### View Mode切り替え

1. View Toggleボタンをクリック
2. レイアウトが切り替わる
   - **Split**: Editor + Logs の2分割表示
   - **Editor**: Editorのみ全幅表示
   - **Logs**: Logsのみ全幅表示

---

## リアルタイム更新

### SSEストリーミング

Claude実行中はSSEでログをリアルタイム受信。Session単位でストリームを管理します。

```tsx
function useClaudeStream(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/claude/stream?sessionId=${sessionId}`);

    eventSource.addEventListener('message', (event) => {
      const message: ChatMessage = JSON.parse(event.data);
      setMessages((prev) => [...prev, message]);
    });

    eventSource.addEventListener('complete', () => {
      eventSource.close();
    });

    eventSource.addEventListener('error', () => {
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  return messages;
}

// 使用例
function ExecutionLogsChat({ session }: Props) {
  const messages = useClaudeStream(session.id);

  // ... UI rendering
}
```

---

## エラーハンドリング

### 実行エラー

```tsx
try {
  await onExecute(task.id, prompt);
} catch (error) {
  console.error('Failed to execute:', error);
  alert('Failed to start execution. Please try again.');
}
```

### 更新エラー

```tsx
try {
  await onUpdate(task.id, formData);
} catch (error) {
  console.error('Failed to update task:', error);
  alert('Failed to update task. Please try again.');
}
```

---

## アクセシビリティ

- フォーカス管理（モーダル開閉時）
- キーボードナビゲーション
- スクリーンリーダー対応

---

## 将来の拡張

### 実行計画表示

```tsx
function ExecutionPlan({ plan }: Props) {
  return (
    <div className="border-b pb-4 mb-4">
      <h2 className="text-lg font-semibold mb-3">Execution Plan</h2>
      <div className="prose prose-sm">
        <ReactMarkdown>{plan}</ReactMarkdown>
      </div>
    </div>
  );
}
```

### メッセージフィルタリング

```tsx
const [messageFilter, setMessageFilter] = useState<'all' | 'user' | 'assistant' | 'tool' | 'error'>(
  'all'
);

const filteredMessages = messages.filter((msg) => {
  if (messageFilter === 'all') return true;
  return msg.role === messageFilter;
});

function MessageFilterBar({ filter, onChange }: Props) {
  return (
    <div className="flex gap-2 mb-2">
      <button onClick={() => onChange('all')} className={filter === 'all' ? 'active' : ''}>
        All
      </button>
      <button onClick={() => onChange('user')} className={filter === 'user' ? 'active' : ''}>
        User
      </button>
      <button
        onClick={() => onChange('assistant')}
        className={filter === 'assistant' ? 'active' : ''}
      >
        Claude
      </button>
      <button onClick={() => onChange('tool')} className={filter === 'tool' ? 'active' : ''}>
        Tools
      </button>
      <button onClick={() => onChange('error')} className={filter === 'error' ? 'active' : ''}>
        Errors
      </button>
    </div>
  );
}
```

### ログエクスポート

```tsx
function exportLogs(messages: ChatMessage[], sessionName: string) {
  const content = messages
    .map((msg) => `[${msg.timestamp}] [${msg.role}] ${msg.content}`)
    .join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sessionName}-chat-logs.txt`;
  a.click();

  URL.revokeObjectURL(url);
}
```

### Session名変更

```tsx
function SessionTabWithRename({ session, onRename }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(session.name);

  const handleRename = async () => {
    if (name.trim() && name !== session.name) {
      await onRename(session.id, name.trim());
    }
    setIsEditing(false);
  };

  return isEditing ? (
    <input
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={handleRename}
      onKeyDown={(e) => e.key === 'Enter' && handleRename()}
      className="px-2 py-1 border rounded"
      autoFocus
    />
  ) : (
    <button onDoubleClick={() => setIsEditing(true)}>{session.name}</button>
  );
}
```

### Session複製

```tsx
async function duplicateSession(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/duplicate`, {
    method: 'POST',
  });
  const newSession = await response.json();
  return newSession;
}
```

### Sessionテンプレート

事前定義されたプロンプトテンプレートからSessionを作成：

```tsx
const SESSION_TEMPLATES = [
  {
    name: 'Code Review',
    prompt:
      'Please review the code in this repository and provide feedback on:\n- Code quality\n- Potential bugs\n- Performance issues\n- Best practices',
  },
  {
    name: 'Bug Fix',
    prompt: "I need help fixing a bug. Here's what I'm experiencing:\n\n[Describe the bug]",
  },
  {
    name: 'Feature Implementation',
    prompt: 'I want to implement a new feature:\n\n[Describe the feature]',
  },
];

function CreateSessionFromTemplate({ onCreateSession }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Templates</h3>
      {SESSION_TEMPLATES.map((template) => (
        <button
          key={template.name}
          onClick={() => onCreateSession(template)}
          className="block w-full text-left px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded"
        >
          {template.name}
        </button>
      ))}
    </div>
  );
}
```
