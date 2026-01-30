import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import * as worktreeManager from '@/lib/worktree-manager';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/tasks/[id]/rebase
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { baseBranch } = body as { baseBranch?: string };

    // タスク情報を取得
    const task = await taskRepo.getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // worktreeが作成されていることを確認
    if (task.worktreeStatus !== 'created') {
      return NextResponse.json({ error: 'Worktree has not been created yet' }, { status: 400 });
    }

    // Claude実行中の場合はエラー
    const isClaudeRunning = task.tabs.some((tab) => tab.status === 'running');
    if (isClaudeRunning) {
      return NextResponse.json({ error: 'Cannot rebase while Claude is running' }, { status: 400 });
    }

    // rebase実行
    const result = await worktreeManager.rebaseWorktree(
      task.owner,
      task.repo,
      task.branch,
      baseBranch
    );

    if (result.success) {
      // rebase成功時にbaseBranchCommitを更新
      if (result.baseBranchCommit) {
        await taskRepo.updateTask(id, { baseBranchCommit: result.baseBranchCommit });
      }

      // SSE broadcast
      sseManager.broadcast('task:rebase:completed', {
        id,
        message: result.message,
      });

      return NextResponse.json({
        data: {
          success: true,
          message: result.message,
        },
      });
    } else {
      // conflict発生
      sseManager.broadcast('task:rebase:failed', {
        id,
        message: result.message,
        conflicts: result.conflicts,
      });

      return NextResponse.json(
        {
          error: result.message,
          conflicts: result.conflicts,
        },
        { status: 409 } // 409 Conflict
      );
    }
  } catch (error) {
    console.error('POST /api/tasks/[id]/rebase error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to rebase worktree';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
