import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask, deleteTask, TaskServiceError } from '@/lib/services/task-service';

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/tasks/[id]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const task = await getTask({ id });
    return NextResponse.json({ data: { task } });
  } catch (error) {
    if (error instanceof TaskServiceError && error.code === 'TASK_NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    console.error('GET /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PUT /api/tasks/[id]
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updatedTask = await updateTask({ id }, body);
    return NextResponse.json({ data: { task: updatedTask } });
  } catch (error) {
    if (error instanceof TaskServiceError && error.code === 'TASK_NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    console.error('PUT /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteTask({ id });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof TaskServiceError && error.code === 'TASK_NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    console.error('DELETE /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
