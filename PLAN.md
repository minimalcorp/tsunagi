# Monaco Editor パフォーマンス改善計画

## 問題の概要

タスク詳細ページのMonaco Editor（prompt入力欄）での編集が、Logsに大量のメッセージがある場合に非常に重い。

## 根本原因

```
SSEメッセージ到着
  → setTabMessages()
  → TaskDetailPage全体が再レンダリング
  → ClaudePromptEditorも再レンダリング候補に
  → Monaco EditorのonChangeが毎回親のsetStateを呼ぶ
  → 不要なprompts stateの更新
  → さらなる再レンダリング連鎖
  → 大量のLogsメッセージがあると差分検出処理が重い
  → Monaco Editorの入力がカクつく
```

## 解決アプローチ

Monaco Editorを**完全なUncontrolled Component**に移行し、編集時に親のsetStateを呼ばないようにする。

### 主な変更点

1. **ClaudePromptEditor**: `onChange`で親のsetStateを呼ばない
2. **TaskDetailPage**: `prompts`をstateからrefに変更し、再レンダリングを防止
3. **値の取得**: アクション実行時にeditorインスタンスから直接取得
4. **タブ切り替え**: useEffectでプロンプトの保存・復元を管理

---

## 詳細な実装計画

### Phase 1: ClaudePromptEditor の変更

#### 1.1 Props インターフェースの変更

```typescript
// BEFORE
interface ClaudePromptEditorProps {
  tab: Tab;
  prompt: string;
  onExecute: (tabId: string, prompt: string) => Promise<void>;
  onInterrupt: (tabId: string) => Promise<void>;
  onPromptChange: (prompt: string) => void; // 削除
}

// AFTER
interface ClaudePromptEditorProps {
  tab: Tab;
  onExecute: (tabId: string, prompt: string) => Promise<void>;
  onInterrupt: (tabId: string) => Promise<void>;
  // onPromptChangeは削除
}

// 公開メソッドの型定義
export interface ClaudePromptEditorHandle {
  getCurrentPrompt: () => string;
  setPrompt: (value: string) => void;
  clearPrompt: () => void;
}
```

#### 1.2 forwardRef と useImperativeHandle の実装

```typescript
import { forwardRef, useImperativeHandle } from 'react';

export const ClaudePromptEditor = forwardRef<ClaudePromptEditorHandle, ClaudePromptEditorProps>(
  ({ tab, onExecute, onInterrupt }, ref) => {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    // 親コンポーネントに公開するメソッド
    useImperativeHandle(ref, () => ({
      getCurrentPrompt: () => editorRef.current?.getValue() || '',
      setPrompt: (value: string) => editorRef.current?.setValue(value),
      clearPrompt: () => editorRef.current?.setValue(''),
    }));

    // ... 残りの実装
  }
);
```

#### 1.3 onChange の削除

```typescript
// BEFORE
<Editor
  onChange={(value) => {
    onPromptChange(value || '');  // これを削除
  }}
/>

// AFTER
<Editor
  // onChangeを完全に削除
/>
```

#### 1.4 タブ切り替え時の処理修正

```typescript
// BEFORE
useEffect(() => {
  if (editorRef.current) {
    const currentValue = editorRef.current.getValue();
    if (currentValue !== prompt) {
      editorRef.current.setValue(prompt);
    }
  }
}, [tab.tab_id]);

// AFTER
// この処理は親コンポーネント側で明示的に呼び出すため削除
```

#### 1.5 React.memo でのメモ化

```typescript
export const ClaudePromptEditor = memo(
  forwardRef<ClaudePromptEditorHandle, ClaudePromptEditorProps>(
    ({ tab, onExecute, onInterrupt }, ref) => {
      // ... 実装
    }
  ),
  (prevProps, nextProps) => {
    // タブID、実行状態が変わらなければ再レンダリングしない
    return (
      prevProps.tab.tab_id === nextProps.tab.tab_id && prevProps.tab.status === nextProps.tab.status
    );
  }
);
```

---

### Phase 2: TaskDetailPage の変更

#### 2.1 State管理の変更

```typescript
// BEFORE
const [prompts, setPrompts] = useState<Record<string, string>>({});

const handlePromptChange = (tab_id: string, prompt: string) => {
  setPrompts((prev) => ({ ...prev, [tab_id]: prompt }));
};

// AFTER
const promptsRef = useRef<Record<string, string>>({});
const editorRef = useRef<ClaudePromptEditorHandle | null>(null);

// handlePromptChangeは削除
```

#### 2.2 タブ切り替え処理の修正

```typescript
// タブ切り替え時に現在の値を保存
const handleTabChange = useCallback(
  (newTabId: string) => {
    // 現在のタブのプロンプトを保存
    if (activeTabId && editorRef.current) {
      const currentPrompt = editorRef.current.getCurrentPrompt();
      promptsRef.current[activeTabId] = currentPrompt;
    }

    // タブIDを切り替え
    setActiveTabId(newTabId);
  },
  [activeTabId]
);

// タブ切り替え後にエディタの値を復元
useEffect(() => {
  if (activeTabId && editorRef.current) {
    const savedPrompt = promptsRef.current[activeTabId] || '';
    editorRef.current.setPrompt(savedPrompt);
  }
}, [activeTabId]);
```

#### 2.3 Execute 処理の修正

```typescript
// BEFORE
const handleExecute = async (tab_id: string, prompt: string) => {
  try {
    const response = await fetch(`/api/tabs/${tab_id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
    });

    if (!response.ok) throw new Error('Failed to execute');

    // 実行成功後にpromptsをクリア
    setPrompts((prev) => ({ ...prev, [tab_id]: '' }));
  } catch (error) {
    console.error('Failed to execute:', error);
    throw error;
  }
};

// AFTER
const handleExecute = useCallback(async (tab_id: string, prompt: string) => {
  try {
    const response = await fetch(`/api/tabs/${tab_id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
    });

    if (!response.ok) throw new Error('Failed to execute');

    // 実行成功後にエディタとRefの両方をクリア
    if (editorRef.current) {
      editorRef.current.clearPrompt();
    }
    promptsRef.current[tab_id] = '';
  } catch (error) {
    console.error('Failed to execute:', error);
    throw error;
  }
}, []);
```

#### 2.4 ClaudePromptEditor の呼び出し修正

```typescript
// BEFORE
<ClaudePromptEditor
  tab={activeTab}
  prompt={prompts[activeTab.tab_id] || ''}
  onExecute={handleExecute}
  onInterrupt={handleInterrupt}
  onPromptChange={(prompt) => handlePromptChange(activeTab.tab_id, prompt)}
/>

// AFTER
<ClaudePromptEditor
  ref={editorRef}
  tab={activeTab}
  onExecute={handleExecute}
  onInterrupt={handleInterrupt}
/>
```

#### 2.5 タブ削除時のクリーンアップ

```typescript
// handleTabDelete内に追加
const handleTabDelete = async (tab_id: string) => {
  try {
    const response = await fetch(`/api/tasks/${id}/tabs/${tab_id}`, {
      method: 'DELETE',
    });

    if (!response.ok) throw new Error('Failed to delete tab');

    // promptsRefからも削除
    delete promptsRef.current[tab_id];

    // ... 既存のロジック
  } catch (error) {
    console.error('Failed to delete tab:', error);
  }
};

// SSEイベントリスナーのtab:deletedハンドラーにも追加
const handleTabDeleted = (event: MessageEvent) => {
  const { taskId, tab_id } = JSON.parse(event.data);
  if (taskId === id) {
    // promptsRefからも削除
    delete promptsRef.current[tab_id];

    // ... 既存のロジック
  }
};
```

#### 2.6 useCallback の活用

```typescript
const handleInterrupt = useCallback(async (tab_id: string) => {
  // ... 実装
}, []);
```

---

### Phase 3: 追加の最適化（オプション）

#### 3.1 ExecutionLogsChat のメモ化

```typescript
export const ExecutionLogsChat = memo(
  ({ rawMessages, tabId }: ExecutionLogsChatProps) => {
    // ... 既存の実装
  },
  (prevProps, nextProps) => {
    return prevProps.tabId === nextProps.tabId && prevProps.rawMessages === nextProps.rawMessages;
  }
);
```

---

## 実装順序

### Step 1: ClaudePromptEditor の変更

1. ✅ forwardRef と useImperativeHandle の追加
2. ✅ Props インターフェースから onPromptChange を削除
3. ✅ onChange の削除
4. ✅ タブ切り替え時の useEffect 削除
5. ✅ React.memo の追加

### Step 2: TaskDetailPage の変更

1. ✅ prompts を state から ref に変更
2. ✅ handlePromptChange の削除
3. ✅ editorRef の追加
4. ✅ handleTabChange の修正
5. ✅ useEffect でのプロンプト復元処理追加
6. ✅ ClaudePromptEditor の呼び出し修正

### Step 3: Execute/Interrupt 処理の修正

1. ✅ handleExecute でのクリア処理変更
2. ✅ useCallback の追加
3. ✅ タブ削除時のクリーンアップ追加

### Step 4: 追加の最適化（オプション）

1. ✅ ExecutionLogsChat の memo 化

### Step 5: テストと検証

1. 各タブでの編集と切り替え
2. Execute 実行とクリア動作
3. タブ削除
4. 大量の Logs メッセージがある状態での編集

---

## メリット

1. **パフォーマンス改善**
   - SSE メッセージ到着時に不要な再レンダリングを防止
   - Monaco Editor の onChange が親の setState を呼ばない
   - 大量の Logs がある場合でも編集がスムーズ

2. **アーキテクチャの明確化**
   - Uncontrolled Component として一貫した設計
   - 状態管理の責任が明確（editor インスタンスが真の状態を保持）

3. **保守性の向上**
   - onChange の削除によりコードがシンプルに
   - デバッグしやすい（promptsRef を見ればタブごとの値が分かる）

---

## トレードオフ

1. **Imperative なインターフェース**
   - useImperativeHandle の使用は React の宣言的な設計から逸脱
   - しかし、editor のような複雑なコンポーネントでは一般的なパターン

2. **タイミングの管理が複雑**
   - タブ切り替え時の値の保存・復元タイミングを慎重に管理する必要
   - useEffect の依存配列を正確に設定する必要

3. **デバッグの難易度**
   - 状態が React DevTools で見えない（promptsRef は Ref のため）
   - console.log やカスタムフックでの監視が必要

---

## 成功基準

- ✅ SSE メッセージ到着時に ClaudePromptEditor が再レンダリングされないこと
- ✅ Monaco Editor 上でのタイピングが 60fps を維持すること
- ✅ タブ切り替え時の応答時間が 100ms 以内であること
- ✅ 大量の Logs（1000件以上）がある状態でも編集がスムーズであること

---

## Critical Files

1. `/src/components/ClaudePromptEditor.tsx` - Monaco Editor を完全な Uncontrolled Component に変更
2. `/src/app/tasks/[id]/page.tsx` - prompts の state 管理を ref に移行
3. `/src/lib/types.ts` - ClaudePromptEditorHandle インターフェースの型定義追加（必要に応じて）

---

## 推定工数

**4-6時間**（実装・テスト含む）

## リスク

**低** - 既存の機能を維持しつつ、パフォーマンスを改善する変更
