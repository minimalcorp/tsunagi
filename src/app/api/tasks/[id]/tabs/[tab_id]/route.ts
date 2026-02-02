import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import { messageQueueManager } from '@/lib/message-queue';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string; tab_id: string }>;
};

// PUT /api/tasks/[id]/tabs/[tab_id]
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id: taskId, tab_id } = await params;
    const body = await request.json();

    const updatedTab = await taskRepo.updateTab(taskId, tab_id, body);
    if (!updatedTab) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
    }

    // SSE broadcast
    sseManager.broadcast('tab:updated', { taskId, tab: updatedTab });

    return NextResponse.json({ data: { tab: updatedTab } });
  } catch (error) {
    console.error('PUT /api/tasks/[id]/tabs/[tab_id] error:', error);
    return NextResponse.json({ error: 'Failed to update tab' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]/tabs/[tab_id]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: taskId, tab_id } = await params;

    // セッションを終了（クリーンアップ）
    await messageQueueManager.endSession(tab_id);

    const success = await taskRepo.deleteTab(taskId, tab_id);
    if (!success) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
    }

    // SSE broadcast
    sseManager.broadcast('tab:deleted', { taskId, tab_id });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/tasks/[id]/tabs/[tab_id] error:', error);
    return NextResponse.json({ error: 'Failed to delete tab' }, { status: 500 });
  }
}
