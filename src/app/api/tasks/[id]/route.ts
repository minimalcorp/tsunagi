import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';
import * as worktreeManager from '@/lib/worktree-manager';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/tasks/[id]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const task = await taskRepo.getTask(id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { task } });
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PUT /api/tasks/[id]
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updatedTask = await taskRepo.updateTask(id, body);

    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // SSE broadcast
    sseManager.broadcast('task:updated', updatedTask);

    return NextResponse.json({ data: { task: updatedTask } });
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // タスク情報を取得
    const task = await taskRepo.getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // タスクを削除（論理削除）
    const success = await taskRepo.deleteTask(id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    }

    // worktreeとブランチを削除（強制削除）
    try {
      await worktreeManager.removeWorktree(task.owner, task.repo, task.branch, true);
    } catch (error) {
      console.error('Failed to remove worktree:', error);
      // worktree削除に失敗してもタスク削除は成功とする
    }

    // SSE broadcast
    sseManager.broadcast('task:deleted', { id });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
