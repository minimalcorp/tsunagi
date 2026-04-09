import { NextRequest, NextResponse } from 'next/server';
import * as worktreeManager from '@/lib/worktree-manager';

type Params = {
  params: Promise<{ owner: string; repo: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { owner, repo } = await params;

    // Fetch latest remote state
    await worktreeManager.fetchRemote(owner, repo);

    // Get branches and default branch
    const [branches, defaultBranch] = await Promise.all([
      worktreeManager.getRemoteBranches(owner, repo),
      worktreeManager.getDefaultBranch(owner, repo),
    ]);

    return NextResponse.json({ data: { branches, defaultBranch } });
  } catch (error) {
    console.error('GET /api/repos/[owner]/[repo]/branches error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch branches';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
