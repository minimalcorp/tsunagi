import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';
import * as worktreeManager from '@/lib/worktree-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/tasks/[id]/needs-rebase
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const task = await taskRepo.getTask(id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // worktreeが作成済みの場合のみチェック
    let needsRebase = false;
    if (task.worktreeStatus === 'created') {
      needsRebase = await worktreeManager.checkRebaseNeeded(task.owner, task.repo, task.branch);
    }

    return NextResponse.json({ data: { needsRebase } });
  } catch (error) {
    console.error('GET /api/tasks/[id]/needs-rebase error:', error);
    return NextResponse.json({ error: 'Failed to check rebase status' }, { status: 500 });
  }
}
