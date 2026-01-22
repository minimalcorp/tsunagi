import { NextRequest, NextResponse } from 'next/server';
import * as worktreeManager from '@/lib/worktree-manager';

// GET /api/worktrees/list?owner=...&repo=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required query parameters: owner, repo' },
        { status: 400 }
      );
    }

    // worktree一覧を取得
    const worktrees = await worktreeManager.listWorktrees(owner, repo);

    return NextResponse.json({ data: worktrees });
  } catch (error) {
    console.error('GET /api/worktrees/list error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list worktrees';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
