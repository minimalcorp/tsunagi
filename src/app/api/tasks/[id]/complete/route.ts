import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import { sseManager } from '@/lib/sse-manager';

// POST /api/tasks/:id/complete - Complete task and merge PR
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const completedTask = await taskRepo.completeTask(id);

    if (!completedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // SSE broadcast
    sseManager.broadcast('task:updated', completedTask);

    return NextResponse.json({
      data: { task: completedTask },
      message: 'Task completed successfully',
    });
  } catch (error) {
    console.error('POST /api/tasks/:id/complete error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to complete task';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
