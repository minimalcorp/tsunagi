import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';

// PUT /api/tasks/:id/plans - Update task planning documents
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { requirement, design, procedure } = body;

    if (!requirement || !design || !procedure) {
      return NextResponse.json(
        { error: 'Missing required fields: requirement, design, procedure' },
        { status: 400 }
      );
    }

    const updatedTask = await taskRepo.updateTaskPlans(id, {
      requirement,
      design,
      procedure,
    });

    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { task: updatedTask } });
  } catch (error) {
    console.error('PUT /api/tasks/:id/plans error:', error);
    return NextResponse.json({ error: 'Failed to update task plans' }, { status: 500 });
  }
}
