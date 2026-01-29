import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';

// POST /api/tasks/validate
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, owner, repo, branch } = body;

    // Validation
    if (!title || !owner || !repo || !branch) {
      return NextResponse.json(
        {
          valid: false,
          errors: [
            {
              field: 'global',
              message: 'Missing required fields: title, owner, repo, branch',
            },
          ],
        },
        { status: 400 }
      );
    }

    // ブランチ名重複チェック
    const existingTasks = await taskRepo.getTasks({ includeDeleted: false });
    const duplicateTask = existingTasks.find(
      (task) => task.owner === owner && task.repo === repo && task.branch === branch
    );

    if (duplicateTask) {
      return NextResponse.json(
        {
          valid: false,
          errors: [
            {
              field: 'branch',
              message: `Branch "${branch}" already exists. Task "${duplicateTask.title}" (ID: ${duplicateTask.id}) is already using this branch.`,
            },
          ],
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('POST /api/tasks/validate error:', error);
    return NextResponse.json(
      {
        valid: false,
        errors: [{ field: 'global', message: 'Validation failed' }],
      },
      { status: 500 }
    );
  }
}
