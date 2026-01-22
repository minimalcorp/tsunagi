import { NextResponse } from 'next/server';
import { createRepo } from '@/lib/repo-repository';
import { initBareRepository, authenticateGhCli } from '@/lib/worktree-manager';
import { getEnv } from '@/lib/env-repository';
import * as path from 'path';
import * as os from 'os';

// Git URLからowner/repoを抽出
function parseGitUrl(gitUrl: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  // SSH: git@github.com:owner/repo.git
  const httpsMatch = gitUrl.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
  const sshMatch = gitUrl.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);

  const match = httpsMatch || sshMatch;
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gitUrl, authToken } = body;

    if (!gitUrl) {
      return NextResponse.json(
        {
          error: 'gitUrl is required',
        },
        { status: 400 }
      );
    }

    // Git URLをパース
    const parsed = parseGitUrl(gitUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error: 'Invalid Git URL format',
        },
        { status: 400 }
      );
    }

    const { owner, repo } = parsed;

    // GitHub PATを環境変数から取得してgh認証
    const envVars = await getEnv('global');
    if (envVars.GITHUB_PAT) {
      try {
        await authenticateGhCli(envVars.GITHUB_PAT);
      } catch (error) {
        console.warn('Failed to authenticate gh CLI, continuing with clone:', error);
        // gh認証に失敗してもcloneは継続
      }
    }

    // Bare repositoryパスを決定
    const bareRepoPath = path.join(os.homedir(), '.tsunagi', 'workspaces', owner, repo, '.bare');

    // Bare cloneを実行
    await initBareRepository(owner, repo, gitUrl, authToken);

    // Repository登録
    const newRepo = await createRepo({
      owner,
      repo,
      cloneUrl: gitUrl,
      authToken,
    });

    return NextResponse.json({
      data: { repository: { ...newRepo, bareRepoPath } },
    });
  } catch (error) {
    console.error('Failed to clone repository:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to clone repository',
      },
      { status: 500 }
    );
  }
}
