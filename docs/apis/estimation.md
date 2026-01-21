# Order/Effort Estimation API

タスクの工数見積もりと実行順序の自動決定に関するAPI仕様です。

---

## 設計

- **REST API**: 見積もり状態の取得 + 見積もり実行（fallback用）
- **WebSocket (Socket.IO)**: 見積もり実行（優先）
- **共通Controller層**: WebSocketとREST APIの両方から呼び出される共通ロジック

**重要**: すべての変更操作（POST）は、WebSocketとREST APIの両方で実装必須です。これにより、WebSocket接続不可時でも、見積もり実行が可能になります。

**注意**: REST APIで実行した見積もりは、リアルタイムプログレス通知（estimate:progress）を受け取れません。見積もり完了後にレスポンスで結果を受け取ります。

---

## 概要

Claudeがタスク内容を分析し、以下を自動的に決定します：

1. **effort（工数）**: タスク完了までの予想時間（時間単位、0.5刻み）
2. **order（実行順序）**: タスクの優先度（0, 1, 2, ...、小さいほど優先）

---

## REST API

### GET /api/tasks/estimate

全todoタスクの見積もり状態を取得します。

#### レスポンス

```typescript
{
  "data": {
    "tasks": Array<{
      id: string,
      title: string,
      effort?: number,
      order?: number,
      estimatedAt?: string  // 最後に見積もりを実行した日時
    }>
  }
}
```

#### 例

```bash
GET /api/tasks/estimate
```

```json
{
  "data": {
    "tasks": [
      {
        "id": "550e8400-...",
        "title": "ログイン機能の実装",
        "effort": 4.0,
        "order": 0,
        "estimatedAt": "2024-01-20T10:00:00.000Z"
      },
      {
        "id": "660e8400-...",
        "title": "ログアウト機能の実装",
        "effort": 1.0,
        "order": 1,
        "estimatedAt": "2024-01-20T10:00:00.000Z"
      }
    ]
  }
}
```

---

### GET /api/tasks/[id]/estimate

単一タスクの見積もり状態を取得します。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "task": {
      id: string,
      title: string,
      effort?: number,
      estimatedAt?: string
    }
  }
}
```

---

### POST /api/tasks/estimate

**Fallback用**: statusがtodoの全タスクを見積もります（WebSocket接続不可時）。

#### レスポンス

```typescript
{
  "data": {
    "estimatedCount": number,  // 見積もりを行ったタスク数
    "tasks": Task[]            // 更新後のタスク一覧（effort, order が設定済み）
  }
}
```

**処理**: WebSocketの `estimate:all` と同じController層を呼び出します。

**注意**: リアルタイムプログレス通知は受け取れません。見積もり完了後にレスポンスで結果を受け取ります。

---

### POST /api/tasks/[id]/estimate

**Fallback用**: 単一タスクの工数を見積もります（WebSocket接続不可時）。

#### パスパラメータ

| パラメータ | 型     | 説明             |
| ---------- | ------ | ---------------- |
| id         | string | タスクID（UUID） |

#### レスポンス

```typescript
{
  "data": {
    "task": Task,              // 更新後のタスク（effortが設定済み）
    "reasoning": string        // 見積もり理由（説明）
  }
}
```

**処理**: WebSocketの `estimate:task` と同じController層を呼び出します。

---

## WebSocket Events

### クライアント → サーバー

#### estimate:all

statusがtodoの全タスクを見積もります。

**処理内容**:

1. `status === 'todo'` のタスクをフィルタリング
2. 全タスクの内容を分析し、相対的な優先度を判定
3. 各タスクの工数（effort）を見積もり
4. 優先度に基づいて order を 0, 1, 2, ... の連番で割り当て
5. 各タスクの `effort`・`order` フィールドを更新

```typescript
{
  "type": "estimate:all"
}
```

**データ不要**: 自動的にtodoタスクをすべて見積もります。

#### estimate:task

単一タスクの工数を見積もります（orderは更新しません）。

```typescript
{
  "type": "estimate:task",
  "data": {
    "taskId": string  // 必須
  }
}
```

**処理内容**:

1. タスクのtitle・description・planを分析
2. Claudeに工数見積もりを依頼
3. タスクの `effort` フィールドのみ更新（orderは更新しない）

---

### サーバー → クライアント

#### estimate:progress

見積もり進捗を通知します（`estimate:all` 実行時のみ）。

```typescript
{
  "type": "estimate:progress",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "data": {
    "total": number,       // 全タスク数
    "completed": number,   // 完了タスク数
    "current": {           // 現在見積もり中のタスク
      id: string,
      title: string
    }
  }
}
```

**UI実装**: プログレスバー表示

#### estimate:completed

見積もりが完了しました。

**全タスク見積もり（estimate:all）**:

```typescript
{
  "type": "estimate:completed",
  "timestamp": "2024-01-20T10:05:00.000Z",
  "data": {
    "type": "all",
    "estimatedCount": number,  // 見積もりを行ったタスク数
    "tasks": Task[]            // 更新後のタスク一覧（effort, order が設定済み）
  }
}
```

**単一タスク見積もり（estimate:task）**:

```typescript
{
  "type": "estimate:completed",
  "timestamp": "2024-01-20T10:01:00.000Z",
  "data": {
    "type": "task",
    "task": Task,              // 更新後のタスク（effortが設定済み）
    "reasoning": string        // 見積もり理由（説明）
  }
}
```

#### estimate:failed

見積もりが失敗しました。

```typescript
{
  "type": "estimate:failed",
  "timestamp": "2024-01-20T10:01:00.000Z",
  "data": {
    "type": "all" | "task",
    "error": string,           // エラーメッセージ
    "taskId"?: string          // estimate:task の場合のみ
  }
}
```

---

## 見積もりアルゴリズム

### 全タスク見積もり（estimate:all）

```typescript
async function estimateAllTasks() {
  // 1. todoタスクを取得
  const todoTasks = tasks.filter((t) => t.status === 'todo');

  // 2. 各タスクの工数を見積もり
  for (const task of todoTasks) {
    const effort = await estimateEffort(task);
    task.effort = effort;
  }

  // 3. 優先度を判定
  const priorityRanking = await rankByPriority(todoTasks);

  // 4. orderを割り当て（0, 1, 2, ...）
  priorityRanking.forEach((task, index) => {
    task.order = index;
  });

  // 5. 保存
  await saveTasks(todoTasks);

  return todoTasks;
}
```

### 単一タスク見積もり（estimate:task）

```typescript
async function estimateTask(taskId: string) {
  const task = await getTask(taskId);

  // title, description, plan を分析
  const prompt = `
    以下のタスクの工数を見積もってください（時間単位、0.5刻み）：

    タイトル: ${task.title}
    説明: ${task.description || 'なし'}
    計画: ${task.plan || 'なし'}

    工数と理由を返してください。
  `;

  const response = await claude.complete(prompt);

  task.effort = parseEffort(response);

  await saveTask(task);

  return {
    task,
    reasoning: response,
  };
}
```

### 優先度ランキング

```typescript
async function rankByPriority(tasks: Task[]) {
  const prompt = `
    以下のタスクを優先度順に並べてください：

    ${tasks.map((t, i) => `${i + 1}. ${t.title}\n   説明: ${t.description || 'なし'}`).join('\n\n')}

    優先度が高い順にタスク番号を返してください。
  `;

  const response = await claude.complete(prompt);
  const ranking = parseRanking(response);

  return ranking.map((index) => tasks[index - 1]);
}
```

---

## UI実装例

```tsx
function EstimationManager() {
  const [estimating, setEstimating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, completed: 0 });
  const ws = useWebSocket();

  useEffect(() => {
    ws.on('estimate:progress', (event) => {
      setProgress({
        total: event.data.total,
        completed: event.data.completed,
      });
    });

    ws.on('estimate:completed', (event) => {
      setEstimating(false);
      if (event.data.type === 'all') {
        toast.success(`${event.data.estimatedCount} tasks estimated`);
        // タスク一覧を更新
        setTasks(event.data.tasks);
      } else {
        toast.success('Task estimated');
        // 単一タスクを更新
        updateTask(event.data.task);
      }
    });

    ws.on('estimate:failed', (event) => {
      setEstimating(false);
      toast.error(event.data.error);
    });
  }, [ws]);

  const estimateAll = () => {
    setEstimating(true);
    ws.send({ type: 'estimate:all' });
  };

  const estimateTask = (taskId: string) => {
    ws.send({
      type: 'estimate:task',
      data: { taskId },
    });
  };

  return (
    <div>
      <button onClick={estimateAll} disabled={estimating}>
        {estimating ? 'Estimating...' : 'Estimate All Tasks'}
      </button>

      {estimating && (
        <ProgressBar
          value={progress.completed}
          max={progress.total}
          label={`${progress.completed} / ${progress.total}`}
        />
      )}
    </div>
  );
}
```

---

## 注意事項

1. **Claude API使用**: 見積もりはClaude APIを使用するため、コストが発生します
2. **実行時間**: タスク数に応じて時間がかかります（1タスクあたり数秒）
3. **並列実行**: `estimate:all` は複数のClaude API呼び出しを並列実行して高速化
4. **キャンセル不可**: 一度開始した見積もりは途中でキャンセルできません（MVP）
5. **上書き**: `estimate:all` は既存のeffort/orderを上書きします

---

## 将来の拡張

- **見積もり履歴**: 過去の見積もり結果を保存して精度向上
- **機械学習**: 実際の完了時間と見積もりの差分を学習
- **キャンセル機能**: 実行中の見積もりをキャンセル
- **カスタマイズ**: 工数の単位、優先度の基準をカスタマイズ
