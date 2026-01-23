import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import * as taskRepo from '@/lib/task-repository';
import { interruptSession } from '@/lib/claude-client';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/sessions/[id]/interrupt
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'running') {
      return NextResponse.json({ error: 'Session is not running' }, { status: 400 });
    }

    // Interrupt the Claude session
    await interruptSession(id);

    // Note: Session status remains 'running' as per SDK design
    // The next message API call will automatically resume the session

    // Update task claudeState to idle
    const task = await taskRepo.getTask(session.taskId);
    if (task) {
      await taskRepo.updateTask(task.id, { claudeState: 'idle' });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/interrupt error:', error);
    return NextResponse.json({ error: 'Failed to interrupt session' }, { status: 500 });
  }
}
