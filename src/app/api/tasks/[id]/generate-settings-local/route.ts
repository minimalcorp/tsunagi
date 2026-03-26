import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import * as worktreeManager from '@/lib/worktree-manager';
import { generateSettingsLocalJson } from '@/lib/claude-settings';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/tasks/[id]/generate-settings-local
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const task = await taskRepo.getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.worktreeStatus !== 'created') {
      return NextResponse.json({ error: 'Worktree has not been created yet' }, { status: 400 });
    }

    const worktreePath = worktreeManager.getWorktreePath(task.owner, task.repo, task.branch);
    generateSettingsLocalJson(worktreePath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/tasks/[id]/generate-settings-local error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to generate settings.local.json';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
