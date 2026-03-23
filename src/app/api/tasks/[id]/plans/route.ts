import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';

// PUT /api/tasks/:id/plans - Update task planning documents
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { requirement, design, procedure } = body;

    // 少なくとも1つのフィールドが必要
    if (!requirement && !design && !procedure) {
      return NextResponse.json(
        { error: 'At least one field (requirement, design, or procedure) is required' },
        { status: 400 }
      );
    }

    // 現在のタスクを取得
    const currentTask = await taskRepo.getTask(id);
    if (!currentTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 提供されたフィールドのみを更新、提供されていないフィールドは既存の値を保持
    const updatedTask = await taskRepo.updateTaskPlans(id, {
      requirement: requirement !== undefined ? requirement : currentTask.requirement,
      design: design !== undefined ? design : currentTask.design,
      procedure: procedure !== undefined ? procedure : currentTask.procedure,
    });

    return NextResponse.json({ data: { task: updatedTask } });
  } catch (error) {
    console.error('PUT /api/tasks/:id/plans error:', error);
    return NextResponse.json({ error: 'Failed to update task plans' }, { status: 500 });
  }
}
