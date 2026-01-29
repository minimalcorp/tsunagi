import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import { interruptSession } from '@/lib/claude-client';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ tab_id: string }>;
};

// POST /api/tabs/[tab_id]/interrupt
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { tab_id } = await params;

    // タスクとタブを探す
    const tasks = await taskRepo.getTasks({ includeDeleted: false });
    let task = null;
    let tab = null;

    for (const t of tasks) {
      const foundTab = t.tabs?.find((tb) => tb.tab_id === tab_id);
      if (foundTab) {
        task = t;
        tab = foundTab;
        break;
      }
    }

    if (!task || !tab) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
    }

    if (tab.status !== 'running') {
      return NextResponse.json({ error: 'Tab is not running' }, { status: 400 });
    }

    // Interrupt the Claude session
    await interruptSession(tab_id);

    // Update tab status to idle after interrupt
    await taskRepo.updateTab(task.id, tab_id, { status: 'idle' });

    // SSE broadcast (tab status changed)
    const updatedTab = await taskRepo.getTab(task.id, tab_id);
    if (updatedTab) {
      sseManager.broadcast('tab:updated', { taskId: task.id, tab: updatedTab });
    }

    const updatedTask = await taskRepo.getTask(task.id);
    if (updatedTask) {
      sseManager.broadcast('task:updated', updatedTask);
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/tabs/[tab_id]/interrupt error:', error);
    return NextResponse.json({ error: 'Failed to interrupt tab' }, { status: 500 });
  }
}
