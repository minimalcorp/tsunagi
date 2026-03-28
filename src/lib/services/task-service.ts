import simpleGit from 'simple-git';
import * as fs from 'fs/promises';
import * as taskRepo from '../repositories/task';
import * as repoRepo from '../repositories/repository';
import * as worktreeManager from '../worktree-manager';
import type { Task } from '../types';

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

export interface CreateTaskResult {
  task: Task;
}

/**
 * タスク作成の共通サービス関数
 * UI/MCP/プランナーClaude すべてこの関数を経由してタスクを作成する
 */
export async function createTask(
  params: CreateTaskParams,
  options?: { io?: { emit: (event: string, data: unknown) => void } }
): Promise<CreateTaskResult> {
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

  // 1. DBにタスク登録
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

  // 2. worktree作成（非同期、失敗してもタスク作成は成功扱い）
  try {
    await worktreeManager.fetchRemote(owner, repo);
    await worktreeManager.createWorktree(owner, repo, branch, baseBranch);
    await taskRepo.updateTask(newTask.id, { worktreeStatus: 'created' });
  } catch (error) {
    console.error('Failed to create worktree:', error);
    await taskRepo.updateTask(newTask.id, { worktreeStatus: 'error' });
  }

  // 3. 初期Tab作成
  try {
    await taskRepo.createTab(newTask.id);
  } catch (error) {
    console.error('Failed to create initial tab:', error);
  }

  // 4. 更新後のタスクを取得
  const updatedTask = await taskRepo.getTask(newTask.id);
  if (!updatedTask) {
    throw new TaskServiceError('Failed to retrieve created task', 'INTERNAL_ERROR');
  }

  // 5. Socket.IO通知
  if (options?.io) {
    options.io.emit('task:created', { task: updatedTask });
  }

  return { task: updatedTask };
}

/**
 * タイトルからbranch名を自動生成
 */
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

export class TaskServiceError extends Error {
  constructor(
    message: string,
    public code: 'REPO_NOT_FOUND' | 'BRANCH_DUPLICATE' | 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'TaskServiceError';
  }
}

/**
 * default branch worktreeを確保する（なければ作成、あれば最新化）
 */
export async function ensureDefaultWorktree(
  owner: string,
  repo: string
): Promise<{ worktreePath: string; defaultBranch: string }> {
  const defaultBranch = await worktreeManager.getDefaultBranch(owner, repo);
  const worktreePath = worktreeManager.getWorktreePath(owner, repo, '.default');
  const bareRepoPath = await worktreeManager.ensureBareRepository(owner, repo);

  // fetchして最新化
  await worktreeManager.fetchRemote(owner, repo);

  let exists = false;
  try {
    await fs.access(worktreePath);
    exists = true;
  } catch {
    // not found
  }

  if (exists) {
    // 既に存在する場合は最新化
    const git = simpleGit(worktreePath);
    await git.raw(['reset', '--hard', `origin/${defaultBranch}`]);
  } else {
    // 新規作成（detached HEADで作成し、branch名の衝突を避ける）
    const bareGit = simpleGit(bareRepoPath);
    await bareGit.raw(['worktree', 'add', '--detach', worktreePath, `origin/${defaultBranch}`]);
  }

  return { worktreePath, defaultBranch };
}
