import { NextRequest, NextResponse } from 'next/server';
import * as worktreeManager from '@/lib/worktree-manager';

// DELETE /api/worktrees/delete
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const branch = searchParams.get('branch');
    const force = searchParams.get('force') === 'true';

    if (!owner || !repo || !branch) {
      return NextResponse.json(
        { error: 'Missing required query parameters: owner, repo, branch' },
        { status: 400 }
      );
    }

    // worktreeを削除
    await worktreeManager.removeWorktree(owner, repo, branch, force);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/worktrees/delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete worktree';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
