import { NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';

type Params = {
  params: Promise<{ tab_id: string }>;
};

// PATCH /api/tabs/[tab_id] - Update tab properties (e.g., model)
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { tab_id } = await params;
    const body = await request.json();
    const { model } = body;

    // Find task that contains this tab
    const tasks = await taskRepo.getTasks({ includeDeleted: false });
    let taskId: string | null = null;

    for (const task of tasks) {
      const tab = task.tabs?.find((t) => t.tab_id === tab_id);
      if (tab) {
        taskId = task.id;
        break;
      }
    }

    if (!taskId) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
    }

    // Update tab
    await taskRepo.updateTab(taskId, tab_id, { model });

    return NextResponse.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    console.error('PATCH /api/tabs/[tab_id] error:', error);
    return NextResponse.json({ error: 'Failed to update tab' }, { status: 500 });
  }
}
