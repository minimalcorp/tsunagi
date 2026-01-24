import { NextRequest, NextResponse } from 'next/server';
import * as worktreeManager from '@/lib/worktree-manager';

// POST /api/worktrees/create
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, branch } = body;

    if (!owner || !repo || !branch) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo, branch' },
        { status: 400 }
      );
    }

    // worktreeを作成
    const worktreePath = await worktreeManager.createWorktree(owner, repo, branch);

    return NextResponse.json({ data: { worktreePath, success: true } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/worktrees/create error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create worktree';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
