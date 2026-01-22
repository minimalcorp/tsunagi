import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const WORKSPACES_ROOT = path.join(os.homedir(), '.tsunagi', 'workspaces');

export interface WorktreeInfo {
  branch: string;
  path: string;
  commit: string;
}

// ブランチ名をディレクトリ名に正規化（スラッシュをハイフンに変換）
export function normalizeBranchName(branch: string): string {
  return branch.replace(/\//g, '-');
}

// bare repositoryのパスを取得
function getBareRepoPath(owner: string, repo: string): string {
  return path.join(WORKSPACES_ROOT, owner, repo, '.bare');
}

// worktreeのパスを取得
function getWorktreePath(owner: string, repo: string, branch: string): string {
  const normalizedBranch = normalizeBranchName(branch);
  return path.join(WORKSPACES_ROOT, owner, repo, normalizedBranch);
}

// bare repositoryを初期化（クローン）
export async function initBareRepository(
  owner: string,
  repo: string,
  cloneUrl: string,
  authToken?: string
): Promise<string> {
  const bareRepoPath = getBareRepoPath(owner, repo);

  // すでに存在する場合はエラー
  try {
    await fs.access(bareRepoPath);
    throw new Error(`Bare repository already exists at ${bareRepoPath}`);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  // 親ディレクトリを作成
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

// bare repositoryが存在するか確認
export async function ensureBareRepository(owner: string, repo: string): Promise<string> {
  const bareRepoPath = getBareRepoPath(owner, repo);

  try {
    await fs.access(bareRepoPath);
    return bareRepoPath;
  } catch {
    throw new Error(`Bare repository not found at ${bareRepoPath}. Please initialize it first.`);
  }
}

// worktreeを作成
export async function createWorktree(owner: string, repo: string, branch: string): Promise<string> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const worktreePath = getWorktreePath(owner, repo, branch);

  // すでに存在する場合はエラー
  try {
    await fs.access(worktreePath);
    throw new Error(`Worktree already exists at ${worktreePath}`);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  const git: SimpleGit = simpleGit(bareRepoPath);

  // ブランチが存在するか確認
  const branches = await git.branch();
  const branchExists = branches.all.some((b) => b === branch || b === `origin/${branch}`);

  if (branchExists) {
    // 既存ブランチをチェックアウト
    await git.raw(['worktree', 'add', worktreePath, branch]);
  } else {
    // 新規ブランチを作成（デフォルトブランチから分岐）
    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);
  }

  return worktreePath;
}

// worktreeを削除
export async function removeWorktree(
  owner: string,
  repo: string,
  branch: string,
  force = false
): Promise<void> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const worktreePath = getWorktreePath(owner, repo, branch);

  // worktreeが存在するか確認
  try {
    await fs.access(worktreePath);
  } catch {
    throw new Error(`Worktree not found at ${worktreePath}`);
  }

  const git: SimpleGit = simpleGit(bareRepoPath);

  // worktreeを削除
  const args = ['worktree', 'remove', worktreePath];
  if (force) {
    args.push('--force');
  }
  await git.raw(args);

  // ブランチも削除（強制削除の場合のみ）
  if (force) {
    try {
      await git.deleteLocalBranch(branch, true);
    } catch {
      // ブランチ削除に失敗しても続行
    }
  }
}

// worktree一覧を取得
export async function listWorktrees(owner: string, repo: string): Promise<WorktreeInfo[]> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const git: SimpleGit = simpleGit(bareRepoPath);

  const output = await git.raw(['worktree', 'list', '--porcelain']);

  const worktrees: WorktreeInfo[] = [];
  const lines = output.split('\n');

  let currentWorktree: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      const worktreePath = line.substring('worktree '.length);
      currentWorktree.path = worktreePath;
    } else if (line.startsWith('branch ')) {
      const branch = line.substring('branch '.length).replace('refs/heads/', '');
      currentWorktree.branch = branch;
    } else if (line.startsWith('HEAD ')) {
      const commit = line.substring('HEAD '.length);
      currentWorktree.commit = commit;
    } else if (line === '') {
      // 空行で区切られるので、現在のworktreeを追加
      if (currentWorktree.path && currentWorktree.branch && currentWorktree.commit) {
        worktrees.push(currentWorktree as WorktreeInfo);
      }
      currentWorktree = {};
    }
  }

  // 最後のworktreeを追加
  if (currentWorktree.path && currentWorktree.branch && currentWorktree.commit) {
    worktrees.push(currentWorktree as WorktreeInfo);
  }

  return worktrees;
}
