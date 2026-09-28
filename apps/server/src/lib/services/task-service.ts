import { simpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as taskRepo from '../repositories/task.js';
import * as repoRepo from '../repositories/repository.js';
import * as worktreeManager from '../worktree-manager.js';
import { normalizeBranchName, validateBranchName } from '../branch-utils.js';
import type { Task, Repository } from '@minimalcorp/tsunagi-shared';
import { prisma } from '../db.js';

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
      | 'INVALID_BRANCH'
      | 'WORKTREE_CREATION_FAILED'
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

  return task;
}

/**
 * 新規タスクのブランチ名を検証する（worktree 作成に失敗する値を事前に弾く）
 */
export async function validateNewTaskBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  const invalidReason = validateBranchName(branch);
  if (invalidReason || !(await worktreeManager.isValidBranchRef(branch))) {
    throw new TaskServiceError(
      `Invalid branch name "${branch}": ${invalidReason ?? 'rejected by git check-ref-format'}`,
      'INVALID_BRANCH'
    );
  }

  const existingTasks = await taskRepo.getTasks({ owner, repo, includeDeleted: false });
  const duplicateTask = existingTasks.find((task) => task.branch === branch);
  if (duplicateTask) {
    throw new TaskServiceError(
      `Branch "${branch}" already exists. Task "${duplicateTask.title}" (ID: ${duplicateTask.id}) is already using this branch.`,
      'BRANCH_DUPLICATE'
    );
  }

  // "/" は "-" に正規化されるため、別名のブランチでも worktree ディレクトリが衝突しうる
  if (await worktreeManager.worktreeExists(owner, repo, branch)) {
    throw new TaskServiceError(
      `Worktree directory "${normalizeBranchName(branch)}" already exists. Use a different branch name.`,
      'BRANCH_DUPLICATE'
    );
  }
}

/**
 * タスクを作成
 *
 * worktree 作成に成功した場合のみタスクを登録する（worktree の無いタスクを作らない）。
 * fetch 失敗時はローカルの参照で worktree を作成し、warnings で通知する。
 */
export async function createTask(
  params: CreateTaskParams,
  options?: ServiceOptions
): Promise<{ task: Task; warnings: string[] }> {
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
  const warnings: string[] = [];

  // リポジトリ存在チェック
  const repository = await repoRepo.getRepo(owner, repo);
  if (!repository) {
    throw new TaskServiceError(
      'Repository not found. Please clone the repository first.',
      'REPO_NOT_FOUND'
    );
  }

  // branch名の解決（未指定の場合はtitleから自動生成）
  const branch = params.branch || generateBranchName(title);
  await validateNewTaskBranch(owner, repo, branch);

  // 1. fetch（失敗してもローカルの参照で続行する）
  try {
    await worktreeManager.fetchRemote(owner, repo);
  } catch (error) {
    console.warn('Failed to fetch remote:', error);
    warnings.push(
      'Failed to fetch from remote. The worktree was created from local refs; update it once the network is available.'
    );
  }

  // baseBranch解決
  const baseBranch = baseBranchInput || (await worktreeManager.getDefaultBranch(owner, repo));

  // 2. worktree作成（失敗したらタスクは作らない）
  try {
    await worktreeManager.createWorktree(owner, repo, branch, baseBranch);
  } catch (error) {
    console.error('Failed to create worktree:', error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new TaskServiceError(`Failed to create worktree: ${reason}`, 'WORKTREE_CREATION_FAILED');
  }

  // 3. order解決 + bumpOrder + DB登録をアトミックに実行（失敗したら worktree を削除）
  let newTask: Task;
  try {
    newTask = await prisma.$transaction(async (tx) => {
      let resolvedOrder: number;
      if (order !== undefined) {
        resolvedOrder = order;
        await taskRepo.bumpOrder(resolvedOrder, undefined, tx);
      } else {
        const result = await tx.task.aggregate({
          where: { owner, repo, deletedAt: null },
          _max: { order: true },
        });
        resolvedOrder = (result._max.order ?? -1) + 1;
      }

      return await taskRepo.createTask(
        {
          title,
          description,
          status,
          owner,
          repo,
          branch,
          baseBranch,
          repoId: repository.id,
          effort,
          order: resolvedOrder,
        },
        tx
      );
    });
  } catch (error) {
    // force=false: 既存のローカルブランチを流用した場合に削除しないよう、ブランチは残す
    try {
      await worktreeManager.removeWorktree(owner, repo, branch);
    } catch (cleanupError) {
      console.error('Failed to remove worktree after task creation failure:', cleanupError);
    }
    throw error;
  }

  // 初期Tabは作らない。タブはユーザーがタスク詳細で起動先（Claude / Ollama 等）を選んで作る

  // 4. Socket.IO通知
  options?.io?.emit('task:created', { task: newTask, warnings });

  return { task: newTask, warnings };
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
