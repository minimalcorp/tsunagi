import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/tasks/[id]/tabs
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: taskId } = await params;

    const task = await taskRepo.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { tabs: task.tabs || [] } });
  } catch (error) {
    console.error('GET /api/tasks/[id]/tabs error:', error);
    return NextResponse.json({ error: 'Failed to fetch tabs' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/tabs
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: taskId } = await params;

    const task = await taskRepo.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const newTab = await taskRepo.createTab(taskId);
    if (!newTab) {
      return NextResponse.json({ error: 'Failed to create tab' }, { status: 500 });
    }

    // SSE broadcast
    sseManager.broadcast('tab:created', { taskId, tab: newTab });

    return NextResponse.json({ data: { tab: newTab } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks/[id]/tabs error:', error);
    return NextResponse.json({ error: 'Failed to create tab' }, { status: 500 });
  }
}
