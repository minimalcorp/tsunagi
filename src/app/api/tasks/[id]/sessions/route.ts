import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import * as taskRepo from '@/lib/task-repository';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/tasks/[id]/sessions
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: taskId } = await params;

    // Verify task exists
    const task = await taskRepo.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const sessions = await sessionRepo.getSessions(taskId);
    return NextResponse.json({ data: { sessions } });
  } catch (error) {
    console.error('GET /api/tasks/[id]/sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/sessions
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: taskId } = await params;

    // Verify task exists
    const task = await taskRepo.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const newSession = await sessionRepo.createSession({
      taskId,
      status: 'idle',
      rawMessages: [],
    });

    // SSE broadcast
    sseManager.broadcast('session:created', newSession);

    return NextResponse.json({ data: { session: newSession } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks/[id]/sessions error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
