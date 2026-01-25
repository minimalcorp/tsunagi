import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { normalizeBranchName } from './branch-utils';

const execAsync = promisify(exec);

const WORKSPACES_ROOT = path.join(os.homedir(), '.tsunagi', 'workspaces');

export interface WorktreeInfo {
  branch: string;
  path: string;
  commit: string;
}

// bare repositoryのパスを取得
function getBareRepoPath(owner: string, repo: string): string {
  return path.join(WORKSPACES_ROOT, owner, repo, '.bare');
}

// gh CLIで認証（GitHub PATを使用）
export async function authenticateGhCli(githubPat: string): Promise<void> {
  try {
    // gh auth statusで認証状態を確認
    try {
      await execAsync('gh auth status');
      // すでに認証されている場合は何もしない
      return;
    } catch {
      // 認証されていない場合は続行
    }

    // gh auth loginでPATを使用して認証
    await execAsync(`echo "${githubPat}" | gh auth login --with-token`);
  } catch (error) {
    throw new Error(
      `Failed to authenticate gh CLI: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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

// リモートの状態を取得（fetch --prune）
export async function fetchRemote(owner: string, repo: string): Promise<void> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const git: SimpleGit = simpleGit(bareRepoPath);
  // bare repositoryでは、リモートブランチを直接refs/heads/に取得
  await git.fetch('origin', '+refs/heads/*:refs/heads/*', { '--prune': null });
}

// リモートブランチの一覧を取得
export async function getRemoteBranches(owner: string, repo: string): Promise<string[]> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const git: SimpleGit = simpleGit(bareRepoPath);
  // bare repositoryでは、リモートブランチはrefs/heads/に格納されている
  const branches = await git.branch();
  return branches.all.filter((b) => !b.includes('HEAD'));
}

// デフォルトブランチを取得
export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const git: SimpleGit = simpleGit(bareRepoPath);
  try {
    // bare repositoryではHEADがデフォルトブランチを指す
    const result = await git.raw(['symbolic-ref', 'HEAD']);
    return result.trim().replace('refs/heads/', '');
  } catch {
    // Fallback: main > master > first branch
    const branches = await getRemoteBranches(owner, repo);
    if (branches.includes('main')) return 'main';
    if (branches.includes('master')) return 'master';
    return branches[0] || 'main';
  }
}

// worktreeを作成
export async function createWorktree(
  owner: string,
  repo: string,
  branch: string,
  baseBranch?: string
): Promise<string> {
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
    // baseBranchが指定されていない場合はデフォルトブランチを使用
    const effectiveBaseBranch = baseBranch || (await getDefaultBranch(owner, repo));
    // 指定されたベースブランチから新規ブランチを作成
    await git.raw(['worktree', 'add', '-b', branch, worktreePath, effectiveBaseBranch]);
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
