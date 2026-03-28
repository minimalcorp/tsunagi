import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/repositories/task';
import type { Task } from '@/lib/types';
import { createTask, TaskServiceError } from '@/lib/services/task-service';

// GET /api/tasks?status=...&owner=...&repo=...&includeDeleted=false
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as Task['status'] | null;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    const tasks = await taskRepo.getTasks({
      status: status || undefined,
      owner: owner || undefined,
      repo: repo || undefined,
      includeDeleted,
    });

    return NextResponse.json({ data: { tasks } });
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, owner, repo, branch, baseBranch } = body;

    if (!title || !owner || !repo || !branch) {
      return NextResponse.json(
        {
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

    const result = await createTask({
      title,
      description,
      owner,
      repo,
      branch,
      baseBranch,
      effort: body.effort,
      order: body.order,
    });

    return NextResponse.json({ data: { task: result.task } }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskServiceError) {
      const statusCode =
        error.code === 'REPO_NOT_FOUND' ? 404 : error.code === 'BRANCH_DUPLICATE' ? 409 : 500;
      return NextResponse.json(
        { errors: [{ field: 'global', message: error.message }] },
        { status: statusCode }
      );
    }
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
