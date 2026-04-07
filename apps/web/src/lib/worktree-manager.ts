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
export function getWorktreePath(owner: string, repo: string, branch: string): string {
  const normalizedBranch = normalizeBranchName(branch);
  return path.join(WORKSPACES_ROOT, owner, repo, normalizedBranch);
}

// bare repositoryを初期化（クローン）
export async function initBareRepository(
  owner: string,
  repo: string,
  cloneUrl: string
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

  // bare repositoryとしてクローン
  const git = simpleGit();
  await git.clone(cloneUrl, bareRepoPath, ['--bare']);

  // 標準的なfetch refspecを設定
  const bareGit = simpleGit(bareRepoPath);
  await bareGit.addConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');

  // Remote tracking branchesを作成
  await bareGit.fetch();

  // origin/HEADを設定
  // 空リポジトリ（リモートにブランチが1つもない）の場合は set-head が失敗するが、
  // clone自体は成功させる。getDefaultBranch() 側の fallback で対応される。
  try {
    await bareGit.raw(['remote', 'set-head', 'origin', '--auto']);
  } catch (error) {
    console.warn('Failed to set origin/HEAD (empty repository?):', error);
  }

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
  // Git configに設定されたfetch refspecを使用
  await git.fetch('origin', { '--prune': null });
  // origin/HEADをリモートの最新デフォルトブランチに自動更新
  // 空リポジトリの場合は失敗するが、fetch自体は成功しているので無視する
  try {
    await git.remote(['set-head', 'origin', '--auto']);
  } catch (error) {
    console.warn('Failed to set origin/HEAD (empty repository?):', error);
  }
}

// リモートブランチの一覧を取得
export async function getRemoteBranches(owner: string, repo: string): Promise<string[]> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const git: SimpleGit = simpleGit(bareRepoPath);
  // Remote branchesのみ取得
  const branches = await git.branch(['-r']);
  return branches.all
    .filter((b) => b.startsWith('origin/') && !b.includes('HEAD'))
    .map((b) => b.replace('origin/', ''));
}

// デフォルトブランチを取得
export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const git: SimpleGit = simpleGit(bareRepoPath);
  try {
    // Remote tracking branchの参照からデフォルトブランチを取得
    const result = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return result.trim().replace('refs/remotes/origin/', '');
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
): Promise<{ worktreePath: string }> {
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

  // ブランチが存在するか確認（local + remote）
  const branches = await git.branch(['-a']);
  const localBranchExists = branches.all.some((b) => b === branch);
  const remoteBranchExists = branches.all.some(
    (b) => b === `remotes/origin/${branch}` || b === `origin/${branch}`
  );

  const effectiveBaseBranch = baseBranch || (await getDefaultBranch(owner, repo));

  if (localBranchExists) {
    // Local branchが存在する場合は直接チェックアウト
    await git.raw(['worktree', 'add', worktreePath, branch]);
  } else if (remoteBranchExists) {
    // Remote branchが存在する場合はlocal tracking branchを作成
    await git.raw(['worktree', 'add', '-b', branch, worktreePath, `origin/${branch}`]);
  } else {
    // 新規ブランチを作成（常にorigin/baseBranchから）
    await git.raw(['worktree', 'add', '-b', branch, worktreePath, `origin/${effectiveBaseBranch}`]);
  }

  return { worktreePath };
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

// base branchが進んでいてrebaseが必要かチェック
export async function checkRebaseNeeded(
  owner: string,
  repo: string,
  branch: string,
  baseBranch?: string
): Promise<boolean> {
  try {
    const bareRepoPath = await ensureBareRepository(owner, repo);
    const worktreePath = getWorktreePath(owner, repo, branch);

    // worktreeが存在するか確認
    try {
      await fs.access(worktreePath);
    } catch {
      return false; // worktreeが存在しない場合はrebase不要
    }

    // リモートの最新状態を取得
    const bareGit: SimpleGit = simpleGit(bareRepoPath);
    await bareGit.fetch('origin', { '--prune': null });

    // デフォルトブランチを取得
    const effectiveBaseBranch = baseBranch || (await getDefaultBranch(owner, repo));
    const targetRef = `origin/${effectiveBaseBranch}`;

    // merge-base（共通祖先）を使ってrebase必要性を判定
    const git: SimpleGit = simpleGit(worktreePath);
    const mergeBaseResult = await git.raw(['merge-base', 'HEAD', targetRef]);
    const mergeBaseCommit = mergeBaseResult.trim();

    const behindResult = await git.raw(['rev-list', '--count', `${mergeBaseCommit}..${targetRef}`]);
    const behindCount = parseInt(behindResult.trim(), 10);

    return behindCount > 0;
  } catch (error) {
    console.error('Failed to check rebase needed:', error);
    return false;
  }
}

// worktreeをrebase
export async function rebaseWorktree(
  owner: string,
  repo: string,
  branch: string,
  baseBranch?: string
): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
  const bareRepoPath = await ensureBareRepository(owner, repo);
  const worktreePath = getWorktreePath(owner, repo, branch);

  // worktreeが存在するか確認
  try {
    await fs.access(worktreePath);
  } catch {
    throw new Error(`Worktree not found at ${worktreePath}`);
  }

  const git: SimpleGit = simpleGit(worktreePath);

  // uncommitted changesがあるかチェック
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('Worktree has uncommitted changes. Please commit or stash your changes first.');
  }

  // リモートの最新状態を取得
  const bareGit: SimpleGit = simpleGit(bareRepoPath);
  await bareGit.fetch('origin', { '--prune': null });

  // デフォルトブランチを取得
  const effectiveBaseBranch = baseBranch || (await getDefaultBranch(owner, repo));
  const targetRef = `origin/${effectiveBaseBranch}`;

  try {
    // rebaseを実行
    await git.rebase([targetRef]);

    return {
      success: true,
      message: `Successfully rebased ${branch} onto ${targetRef}`,
    };
  } catch {
    // rebase失敗時の処理
    try {
      // conflictファイルを取得
      const conflictStatus = await git.status();
      const conflicts = conflictStatus.conflicted;

      // rebaseをabort
      await git.rebase(['--abort']);

      return {
        success: false,
        message: `Rebase failed due to conflicts. Branch has been reset to original state.`,
        conflicts,
      };
    } catch (abortError) {
      // abortも失敗した場合
      throw new Error(
        `Rebase failed and abort also failed: ${abortError instanceof Error ? abortError.message : String(abortError)}`
      );
    }
  }
}
