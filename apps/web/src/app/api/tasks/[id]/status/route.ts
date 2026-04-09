import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import type { Task } from '@minimalcorp/tsunagi-shared';

// PUT /api/tasks/:id/status - Transition task status
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, pullRequestUrl } = body;

    const validStatuses: Task['status'][] = ['backlog', 'planning', 'coding', 'reviewing', 'done'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const updatedTask = await taskRepo.transitionTaskStatus(id, status, { pullRequestUrl });

    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { task: updatedTask } });
  } catch (error) {
    console.error('PUT /api/tasks/:id/status error:', error);
    return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 });
  }
}
