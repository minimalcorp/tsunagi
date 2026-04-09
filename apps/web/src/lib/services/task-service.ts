import simpleGit from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as taskRepo from '../repositories/task';
import * as repoRepo from '../repositories/repository';
import * as worktreeManager from '../worktree-manager';
import { normalizeBranchName } from '../branch-utils';
import type { Task, Repository } from '@minimalcorp/tsunagi-shared';
import { prisma } from '../db';

// ============================================
// Types
// ============================================

export interface IOEmitter {
  emit: (event: string, data: unknown) => void;
}

export interface ServiceOptions {
  io?: IOEmitter;
}

export type TaskIdentifier = { id?: string; session_id?: string; cwd?: string };

export interface CreateTaskParams {
  title: string;
  description?: string;
  owner: string;
  repo: string;
  branch?: string;
  baseBranch?: string;
  effort?: number;
  order?: number;
  status?: Task['status'];
}

export class TaskServiceError extends Error {
  constructor(
    message: string,
    public code:
      | 'REPO_NOT_FOUND'
      | 'BRANCH_DUPLICATE'
      | 'TASK_NOT_FOUND'
      | 'IDENTIFIER_REQUIRED'
      | 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'TaskServiceError';
  }
}

// ============================================
// Task Resolution
// ============================================

const WORKSPACES_ROOT = path.join(os.homedir(), '.tsunagi', 'workspaces');

/** CWDからowner/repo/branchを抽出する */
function parseWorktreePath(cwd: string): { owner: string; repo: string; branch: string } | null {
  const relative = path.relative(WORKSPACES_ROOT, cwd);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  const parts = relative.split(path.sep);
  if (parts.length < 3) return null;

  return { owner: parts[0], repo: parts[1], branch: parts[2] };
}

/**
 * id / session_id / cwd からタスクを解決する
 */
export async function resolveTask(identifier: TaskIdentifier): Promise<Task | null> {
  // identifier が全て未指定の場合は明確にエラー（`Task not found` と区別するため）
  if (!identifier.id && !identifier.session_id && !identifier.cwd) {
    throw new TaskServiceError(
      'Identifier required: provide one of `id`, `session_id`, or `cwd`. ' +
        'Note: the parameter name is `id` (not `taskId`), and `session_id` / `cwd` use snake_case.',
      'IDENTIFIER_REQUIRED'
    );
  }

  // 1. id指定
  if (identifier.id) {
    return taskRepo.getTask(identifier.id);
  }

  // 2. session_id指定: tabId → taskId → Task
  if (identifier.session_id) {
    const tab = await prisma.tab.findUnique({ where: { tabId: identifier.session_id } });
    if (!tab) return null;
    return taskRepo.getTask(tab.taskId);
  }

  // 3. cwd指定: パスからowner/repo/branchを抽出してタスクを検索
  if (identifier.cwd) {
    const parsed = parseWorktreePath(identifier.cwd);
    if (!parsed) return null;

    const tasks = await taskRepo.getTasks({
      owner: parsed.owner,
      repo: parsed.repo,
      includeDeleted: false,
    });

    return (
      tasks.find((t) => {
        const normalized = normalizeBranchName(t.branch);
        return normalized === parsed.branch;
      }) ?? null
    );
  }

  return null;
}

// ============================================
// Task CRUD
// ============================================

/**
 * タスク一覧を取得
 */
export async function listTasks(filter?: {
  owner?: string;
  repo?: string;
  status?: Task['status'] | Task['status'][];
  includeDeleted?: boolean;
}): Promise<Task[]> {
  return taskRepo.getTasks({
    owner: filter?.owner,
    repo: filter?.repo,
    status: filter?.status,
    includeDeleted: filter?.includeDeleted ?? false,
  });
}

/**
 * タスクを取得（identifier で解決）
 */
export async function getTask(identifier: TaskIdentifier): Promise<Task> {
  const task = await resolveTask(identifier);
  if (!task) {
    throw new TaskServiceError('Task not found', 'TASK_NOT_FOUND');
  }

  // worktreePathを付与
  const worktreePath = worktreeManager.getWorktreePath(task.owner, task.repo, task.branch);
  return { ...task, worktreePath };
}

/**
 * タスクを作成
 */
export async function createTask(
  params: CreateTaskParams,
  options?: ServiceOptions
): Promise<{ task: Task }> {
  const {
    title,
    description = '',
    owner,
    repo,
    baseBranch: baseBranchInput,
    effort,
    order,
    status = 'backlog',
  } = params;

  // リポジトリ存在チェック
  const repository = await repoRepo.getRepo(owner, repo);
  if (!repository) {
    throw new TaskServiceError(
      'Repository not found. Please clone the repository first.',
      'REPO_NOT_FOUND'
    );
  }

  // baseBranch解決
  const baseBranch = baseBranchInput || (await worktreeManager.getDefaultBranch(owner, repo));

  // branch名の解決（未指定の場合はtitleから自動生成）
  const branch = params.branch || generateBranchName(title);

  // ブランチ名重複チェック
  const existingTasks = await taskRepo.getTasks({ includeDeleted: false });
  const duplicateTask = existingTasks.find(
    (task) => task.owner === owner && task.repo === repo && task.branch === branch
  );
  if (duplicateTask) {
    throw new TaskServiceError(
      `Branch "${branch}" already exists. Task "${duplicateTask.title}" (ID: ${duplicateTask.id}) is already using this branch.`,
      'BRANCH_DUPLICATE'
    );
  }

  // 1. order指定時は玉突き処理
  if (order !== undefined) {
    await taskRepo.bumpOrder(order);
  }

  // 2. DBにタスク登録
  const newTask = await taskRepo.createTask({
    title,
    description,
    status,
    owner,
    repo,
    branch,
    baseBranch,
    repoId: repository.id,
    worktreeStatus: 'pending',
    effort,
    order,
  });

  // 3. worktree作成
  try {
    await worktreeManager.fetchRemote(owner, repo);
    await worktreeManager.createWorktree(owner, repo, branch, baseBranch);
    await taskRepo.updateTask(newTask.id, { worktreeStatus: 'created' });
  } catch (error) {
    console.error('Failed to create worktree:', error);
    await taskRepo.updateTask(newTask.id, { worktreeStatus: 'error' });
  }

  // 4. 初期Tab作成
  try {
    await taskRepo.createTab(newTask.id);
  } catch (error) {
    console.error('Failed to create initial tab:', error);
  }

  // 5. 更新後のタスクを取得
  const updatedTask = await taskRepo.getTask(newTask.id);
  if (!updatedTask) {
    throw new TaskServiceError('Failed to retrieve created task', 'INTERNAL_ERROR');
  }

  // 6. Socket.IO通知
  options?.io?.emit('task:created', { task: updatedTask });

  return { task: updatedTask };
}

/**
 * タスクを更新（identifier で解決）
 */
export async function updateTask(
  identifier: TaskIdentifier,
  updates: Partial<
    Pick<
      Task,
      'title' | 'description' | 'status' | 'effort' | 'order' | 'baseBranch' | 'pullRequestUrl'
    >
  >,
  options?: ServiceOptions
): Promise<Task> {
  const task = await resolveTask(identifier);
  if (!task) {
    throw new TaskServiceError('Task not found', 'TASK_NOT_FOUND');
  }

  // order変更時は玉突き処理
  if (updates.order !== undefined) {
    await taskRepo.bumpOrder(updates.order, task.id);
  }

  const updatedTask = await taskRepo.updateTask(task.id, updates);
  if (!updatedTask) {
    throw new TaskServiceError('Failed to update task', 'INTERNAL_ERROR');
  }

  // Socket.IO通知
  options?.io?.emit('task:updated', { task: updatedTask });

  return updatedTask;
}

/**
 * タスクを削除（soft delete + worktree削除）
 */
export async function deleteTask(
  identifier: TaskIdentifier,
  options?: ServiceOptions
): Promise<void> {
  const task = await resolveTask(identifier);
  if (!task) {
    throw new TaskServiceError('Task not found', 'TASK_NOT_FOUND');
  }

  // 1. soft delete
  const success = await taskRepo.deleteTask(task.id);
  if (!success) {
    throw new TaskServiceError('Failed to delete task', 'INTERNAL_ERROR');
  }

  // 2. worktree削除（失敗してもタスク削除は成功扱い）
  if (task.branch) {
    try {
      await worktreeManager.removeWorktree(task.owner, task.repo, task.branch, true);
    } catch (error) {
      console.error('Failed to remove worktree:', error);
    }
  }

  // 3. Socket.IO通知
  options?.io?.emit('task:deleted', { taskId: task.id });
}

// ============================================
// Repository
// ============================================

/**
 * リポジトリ一覧を取得
 */
export async function listRepos(): Promise<Repository[]> {
  return repoRepo.getRepos();
}

// ============================================
// Default Worktree
// ============================================

/**
 * default branch worktreeを確保する（なければ作成、あれば最新化）
 */
// `.default` worktree を必ずリモートの default branch と同期させる。
//
// 状態:
//   A. orphan  - リモートにまだ default branch commit が無い空リポジトリ状態
//   B. detached - origin/<defaultBranch> を指す detached HEAD (通常状態)
//
// 状態遷移:
//   初回 & empty       → A を作成
//   初回 & non-empty   → B を作成
//   既存 A & empty     → 何もしない
//   既存 A & non-empty → A を破棄して B を作り直す (昇格)
//   既存 B & non-empty → git reset --hard origin/<defaultBranch> で同期
export async function ensureDefaultWorktree(
  owner: string,
  repo: string
): Promise<{ worktreePath: string; defaultBranch: string }> {
  const bareRepoPath = await worktreeManager.ensureBareRepository(owner, repo);
  await worktreeManager.fetchRemote(owner, repo);

  const empty = await worktreeManager.isEmptyRepo(owner, repo);
  const defaultBranch = await worktreeManager.getDefaultBranch(owner, repo);
  const worktreePath = worktreeManager.getWorktreePath(owner, repo, '.default');

  let exists = false;
  try {
    await fs.access(worktreePath);
    exists = true;
  } catch {
    // not found
  }

  const bareGit = simpleGit(bareRepoPath);

  if (!exists) {
    if (empty) {
      // 状態A を新規作成: orphan branch (Git >= 2.42)
      await bareGit.raw(['worktree', 'add', '--orphan', '-b', defaultBranch, worktreePath]);
    } else {
      // 状態B を新規作成: detached HEAD on origin/<defaultBranch>
      await bareGit.raw(['worktree', 'add', '--detach', worktreePath, `origin/${defaultBranch}`]);
    }
    return { worktreePath, defaultBranch };
  }

  if (empty) {
    // まだリモート空 → 状態 A のまま放置
    return { worktreePath, defaultBranch };
  }

  // empty === false: リモートに default branch が存在する
  if (await worktreeManager.isUnbornWorktree(worktreePath)) {
    // A → B 昇格: orphan worktree を破棄して detached で作り直す
    await bareGit.raw(['worktree', 'remove', '--force', worktreePath]);
    await bareGit.raw(['worktree', 'add', '--detach', worktreePath, `origin/${defaultBranch}`]);
  } else {
    // B → B: 通常の同期
    const git = simpleGit(worktreePath);
    await git.raw(['reset', '--hard', `origin/${defaultBranch}`]);
  }

  return { worktreePath, defaultBranch };
}

// ============================================
// Internal Helpers
// ============================================

function generateBranchName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const suffix = Date.now().toString(36).slice(-4);
  return `feat/${slug}-${suffix}`;
}
