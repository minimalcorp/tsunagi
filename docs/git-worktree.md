# Git Worktree管理

TsunagiにおけるGit worktreeの管理方法について説明します。Git worktreeを活用することで、複数のブランチを同時に扱える効率的な開発環境を実現します。

---

## Git Worktreeとは

Git worktreeは、1つのリポジトリで複数のブランチを同時にチェックアウトできる機能です。

### 従来の方法

```bash
# ブランチ切り替え時にファイルが書き換わる
git checkout main
# 作業...
git checkout feature/auth
# main の変更は見えなくなる
```

### Git Worktreeの方法

```bash
# 各ブランチが独立したディレクトリに存在
cd main/           # mainブランチ
cd feature-auth/   # feature/authブランチ
# 両方のファイルが同時にアクセス可能
```

---

## ディレクトリ構造

### 基本構造

```
~/.tsunagi/workspaces/
└── {owner}/
    └── {repo}/
        ├── .git/           # bare repository
        ├── main/           # mainブランチのworktree
        └── feat-auth/      # feature/authブランチのworktree
```

### 例: minimalcorp/tsunagi

```
~/.tsunagi/workspaces/minimalcorp/tsunagi/
├── .git/                   # bare repository
├── main/                   # mainブランチ
│   ├── .git               # worktreeへのリンク
│   ├── src/
│   ├── package.json
│   └── ...
└── feat-auth/              # feat/authブランチ
    ├── .git
    ├── src/
    ├── package.json
    └── ...
```

---

## Bare Repositoryの初期化

### 初回セットアップ

```bash
# ホームディレクトリ配下にworktreeルートを作成
mkdir -p ~/tsunagi

# owner/repo ディレクトリを作成
mkdir -p ~/.tsunagi/workspaces/{owner}

# bare repositoryとしてクローン
cd ~/.tsunagi/workspaces/{owner}
git clone --bare {clone-url} {repo}
```

### TypeScript実装例

```typescript
import simpleGit from 'simple-git';
import * as path from 'path';
import * as os from 'os';

async function initBareRepository(
  owner: string,
  repo: string,
  cloneUrl: string,
  authToken?: string
): Promise<string> {
  const worktreeRoot = path.join(os.homedir(), 'tsunagi');
  const bareRepoPath = path.join(worktreeRoot, owner, repo);

  // ディレクトリ作成
  await fs.mkdir(path.dirname(bareRepoPath), { recursive: true });

  // 認証トークンがある場合はURLに埋め込む
  let authCloneUrl = cloneUrl;
  if (authToken && cloneUrl.startsWith('https://')) {
    const url = new URL(cloneUrl);
    url.username = authToken;
    authCloneUrl = url.toString();
  }

  // bare repositoryとしてクローン
  const git = simpleGit();
  await git.clone(authCloneUrl, bareRepoPath, ['--bare']);

  return bareRepoPath;
}
```

---

## Worktreeの作成

### コマンド

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}
git worktree add {branch-name} {branch-name}
```

例:

```bash
cd ~/.tsunagi/workspaces/minimalcorp/tsunagi
git worktree add main main
git worktree add feat-auth feat/auth
```

### ブランチ名の正規化

ブランチ名にスラッシュが含まれる場合、ディレクトリ名として使用できないため正規化します：

```typescript
function normalizeBranchName(branch: string): string {
  return branch.replace(/\//g, '-');
}

// 例:
// "feat/auth" → "feat-auth"
// "bugfix/login-error" → "bugfix-login-error"
```

### TypeScript実装例

```typescript
async function createWorktree(owner: string, repo: string, branch: string): Promise<string> {
  const bareRepoPath = path.join(os.homedir(), 'tsunagi', owner, repo);
  const worktreeName = normalizeBranchName(branch);
  const worktreePath = path.join(bareRepoPath, worktreeName);

  const git = simpleGit(bareRepoPath);

  // リモートブランチが存在するか確認
  const branches = await git.branch(['-r']);
  const remoteBranch = `origin/${branch}`;

  if (branches.all.includes(remoteBranch)) {
    // リモートブランチが存在する場合
    await git.raw(['worktree', 'add', worktreeName, branch]);
  } else {
    // 新規ブランチを作成
    await git.raw(['worktree', 'add', '-b', branch, worktreeName]);
  }

  return worktreePath;
}
```

---

## Worktreeの削除

### コマンド

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}
# 通常の削除
git worktree remove {branch-name}

# 強制削除（未コミットの変更がある場合も削除）
git worktree remove --force {branch-name}
```

### TypeScript実装例

```typescript
async function removeWorktree(
  owner: string,
  repo: string,
  branch: string,
  force: boolean = true
): Promise<void> {
  const bareRepoPath = path.join(os.homedir(), 'tsunagi', owner, repo);
  const worktreeName = normalizeBranchName(branch);

  const git = simpleGit(bareRepoPath);

  // worktreeを削除（デフォルトで --force を使用）
  const args = ['worktree', 'remove'];
  if (force) {
    args.push('--force');
  }
  args.push(worktreeName);

  await git.raw(args);
}
```

---

## Worktree一覧の取得

### コマンド

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}
git worktree list
```

出力例:

```
/Users/username/tsunagi/minimalcorp/tsunagi         abc1234 (bare)
/Users/username/tsunagi/minimalcorp/tsunagi/main    def5678 [main]
/Users/username/tsunagi/minimalcorp/tsunagi/feat-auth  ghi9012 [feat/auth]
```

### TypeScript実装例

```typescript
interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isBare: boolean;
}

async function listWorktrees(owner: string, repo: string): Promise<WorktreeInfo[]> {
  const bareRepoPath = path.join(os.homedir(), 'tsunagi', owner, repo);
  const git = simpleGit(bareRepoPath);

  const output = await git.raw(['worktree', 'list', '--porcelain']);

  // パース
  const worktrees: WorktreeInfo[] = [];
  const lines = output.split('\n');

  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      current.path = line.substring('worktree '.length);
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring('branch '.length).replace('refs/heads/', '');
    } else if (line.startsWith('bare')) {
      current.isBare = true;
    } else if (line === '') {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {};
    }
  }

  return worktrees.filter((w) => !w.isBare);
}
```

---

## タスクとWorktreeの連携

### タスク作成時の自動worktree生成

```typescript
async function createTaskWithWorktree(
  taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Task> {
  // 1. タスク作成
  const task = await createTask(taskData);

  // 2. リポジトリ情報取得
  const repo = await getRepository(taskData.owner, taskData.repo);

  if (!repo) {
    throw new Error('Repository not found. Please register the repository first.');
  }

  // 3. worktree存在チェック
  const worktrees = await listWorktrees(taskData.owner, taskData.repo);
  const worktreeName = normalizeBranchName(taskData.branch);
  const exists = worktrees.some((w) => path.basename(w.path) === worktreeName);

  // 4. worktree作成（存在しない場合）
  if (!exists) {
    await createWorktree(taskData.owner, taskData.repo, taskData.branch);
  }

  return task;
}
```

### タスク削除時のworktree/branch自動削除

**重要**: 1タスク = 1ブランチ = 1 worktree の制約により、タスク削除時は対応するworktreeとブランチも自動的に削除されます。

```typescript
async function deleteTaskWithWorktree(taskId: string): Promise<void> {
  // 1. タスク取得
  const task = await getTask(taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  // 2. タスク削除
  await deleteTask(taskId);

  // 3. worktree/branch自動削除
  // 未コミットの変更があっても強制削除
  await removeWorktree(task.owner, task.repo, task.branch, true);

  // 4. リモートブランチも削除（オプション）
  const bareRepoPath = path.join(os.homedir(), 'tsunagi', task.owner, task.repo);
  const git = simpleGit(bareRepoPath);

  try {
    // ローカルブランチ削除
    await git.raw(['branch', '-D', task.branch]);

    // リモートブランチ削除（存在する場合）
    await git.push('origin', task.branch, ['--delete']);
  } catch (error) {
    // ブランチが存在しない場合は無視
    console.warn('Branch deletion failed (may not exist):', error);
  }
}
```

**動作の詳細**:

- **強制削除**: `git worktree remove --force` を使用し、未コミットの変更があっても削除
- **ブランチ削除**: ローカルブランチとリモートブランチの両方を削除
- **データ損失の注意**: 削除前にユーザーに確認ダイアログを表示することを推奨

---

## Claude実行時のWorking Directory指定

Claudeを実行する際、worktreeのパスをworking directoryとして指定します。

```typescript
async function executeClaude(taskId: string, prompt: string): Promise<void> {
  const task = await getTask(taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  // worktreeパスを取得
  const worktreeRoot = path.join(os.homedir(), 'tsunagi');
  const worktreeName = normalizeBranchName(task.branch);
  const workingDirectory = path.join(worktreeRoot, task.owner, task.repo, worktreeName);

  // worktreeが存在するか確認
  try {
    await fs.access(workingDirectory);
  } catch {
    throw new Error('Worktree not found. Please create the worktree first.');
  }

  // Claude実行（working directoryを指定）
  await claudeClient.execute({
    prompt,
    workingDirectory,
    taskId,
  });
}
```

---

## エラーハンドリング

### Worktreeがすでに存在する場合

```typescript
async function safeCreateWorktree(owner: string, repo: string, branch: string): Promise<string> {
  try {
    return await createWorktree(owner, repo, branch);
  } catch (error) {
    if (error.message.includes('already exists')) {
      // すでに存在する場合はパスを返す
      const worktreeName = normalizeBranchName(branch);
      return path.join(os.homedir(), 'tsunagi', owner, repo, worktreeName);
    }
    throw error;
  }
}
```

### Bare repositoryが存在しない場合

```typescript
async function ensureBareRepository(owner: string, repo: string): Promise<string> {
  const bareRepoPath = path.join(os.homedir(), 'tsunagi', owner, repo);

  try {
    // .gitディレクトリが存在するか確認
    await fs.access(path.join(bareRepoPath, 'HEAD'));
    return bareRepoPath;
  } catch {
    // 存在しない場合はリポジトリ情報を取得して初期化
    const repository = await getRepository(owner, repo);

    if (!repository) {
      throw new Error('Repository not found. Please register the repository first.');
    }

    return await initBareRepository(owner, repo, repository.cloneUrl, repository.authToken);
  }
}
```

---

## パフォーマンス最適化

### Worktree情報のキャッシュ

頻繁にworktree一覧を取得する場合はキャッシュを活用：

```typescript
class WorktreeManager {
  private cache: Map<string, WorktreeInfo[]> = new Map();
  private CACHE_TTL = 60000; // 1分

  async getWorktrees(owner: string, repo: string): Promise<WorktreeInfo[]> {
    const key = `${owner}/${repo}`;
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const worktrees = await listWorktrees(owner, repo);
    this.cache.set(key, worktrees);

    // TTL後にキャッシュを削除
    setTimeout(() => {
      this.cache.delete(key);
    }, this.CACHE_TTL);

    return worktrees;
  }
}
```

---

## セキュリティ考慮事項

### パストラバーサル攻撃の防止

```typescript
function validatePath(owner: string, repo: string, branch: string): void {
  // パス要素に ".." や絶対パスが含まれていないか確認
  const invalidChars = ['..', '//', '\\\\'];

  for (const part of [owner, repo, branch]) {
    for (const char of invalidChars) {
      if (part.includes(char)) {
        throw new Error('Invalid path component');
      }
    }
  }
}
```

---

## トラブルシューティング

### Worktreeが壊れている場合

```bash
# worktreeの修復
git worktree repair

# worktreeを強制削除
git worktree remove --force {branch-name}
```

### Bare repositoryの修復

```bash
cd ~/.tsunagi/workspaces/{owner}/{repo}
git fsck
git gc
```

---

## 将来の拡張

### 自動クリーンアップ

使用されていないworktreeを定期的に削除：

```typescript
async function cleanupUnusedWorktrees(): Promise<void> {
  const repos = await getRepositories();
  const tasks = await getTasks();

  for (const repo of repos) {
    const worktrees = await listWorktrees(repo.owner, repo.repo);

    for (const worktree of worktrees) {
      const branch = path.basename(worktree.path);
      const hasTask = tasks.some(
        (t) =>
          t.owner === repo.owner && t.repo === repo.repo && normalizeBranchName(t.branch) === branch
      );

      if (!hasTask) {
        console.log(`Cleaning up unused worktree: ${worktree.path}`);
        // 削除確認のダイアログを表示（オプション）
        await removeWorktree(repo.owner, repo.repo, branch);
      }
    }
  }
}
```
