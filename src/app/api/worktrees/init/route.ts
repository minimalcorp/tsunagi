import { NextRequest, NextResponse } from 'next/server';
import * as worktreeManager from '@/lib/worktree-manager';
import * as repoRepo from '@/lib/repo-repository';

// POST /api/worktrees/init
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo } = body;

    if (!owner || !repo) {
      return NextResponse.json({ error: 'Missing required fields: owner, repo' }, { status: 400 });
    }

    // リポジトリ情報を取得
    const repository = await repoRepo.getRepo(owner, repo);
    if (!repository) {
      return NextResponse.json(
        { error: 'Repository not found. Please register it first.' },
        { status: 404 }
      );
    }

    // bare repositoryを初期化
    const bareRepoPath = await worktreeManager.initBareRepository(
      owner,
      repo,
      repository.cloneUrl,
      repository.authToken
    );

    return NextResponse.json({ data: { bareRepoPath, success: true } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/worktrees/init error:', error);
    const message = error instanceof Error ? error.message : 'Failed to initialize bare repository';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
