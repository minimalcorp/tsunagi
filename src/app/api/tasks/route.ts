import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';
import * as worktreeManager from '@/lib/worktree-manager';
import type { Task } from '@/lib/types';

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
    const { title, description, owner, repo, branch } = body;

    // Validation
    if (!title || !description || !owner || !repo || !branch) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, owner, repo, branch' },
        { status: 400 }
      );
    }

    // タスクを作成
    const newTask = await taskRepo.createTask({
      title,
      description,
      status: 'backlog',
      owner,
      repo,
      branch,
      worktreeStatus: 'pending',
      claudeState: 'idle',
      plan: body.plan,
      effort: body.effort,
      order: body.order,
    });

    // worktreeを自動作成
    try {
      await worktreeManager.createWorktree(owner, repo, branch);
      await taskRepo.updateTask(newTask.id, { worktreeStatus: 'created' });
    } catch (error) {
      console.error('Failed to create worktree:', error);
      await taskRepo.updateTask(newTask.id, { worktreeStatus: 'error' });
      // worktreeエラーはタスク作成失敗にはしない（後で手動作成可能）
    }

    // 更新後のタスクを取得
    const updatedTask = await taskRepo.getTask(newTask.id);

    return NextResponse.json({ data: { task: updatedTask } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
