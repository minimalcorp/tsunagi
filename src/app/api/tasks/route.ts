import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';
import * as tabRepo from '@/lib/tab-repository';
import * as worktreeManager from '@/lib/worktree-manager';
import type { Task } from '@/lib/types';
import { sseManager } from '@/lib/sse-manager';

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

    // 各タスクのタブにuserPromptCountを追加
    const tasksWithCounts = await Promise.all(
      tasks.map(async (task) => {
        const tabsWithCounts = await Promise.all(
          task.tabs.map(async (tab) => {
            const sessionData = await tabRepo.getSessionData(tab.tab_id);
            return {
              ...tab,
              userPromptCount: sessionData?.userPrompts?.length ?? 0,
            };
          })
        );
        return {
          ...task,
          tabs: tabsWithCounts,
        };
      })
    );

    return NextResponse.json({ data: { tasks: tasksWithCounts } });
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

    // Validation
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

    // ブランチ名重複チェック
    const existingTasks = await taskRepo.getTasks({ includeDeleted: false });
    const duplicateTask = existingTasks.find(
      (task) => task.owner === owner && task.repo === repo && task.branch === branch
    );

    if (duplicateTask) {
      return NextResponse.json(
        {
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

    // タスクを作成
    const newTask = await taskRepo.createTask({
      title,
      description: description || '',
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
      // 最新のremote情報を取得
      await worktreeManager.fetchRemote(owner, repo);
      await worktreeManager.createWorktree(owner, repo, branch, baseBranch);
      await taskRepo.updateTask(newTask.id, { worktreeStatus: 'created' });
    } catch (error) {
      console.error('Failed to create worktree:', error);
      await taskRepo.updateTask(newTask.id, { worktreeStatus: 'error' });
      // worktreeエラーはタスク作成失敗にはしない（後で手動作成可能）
    }

    // 最初のタブを自動作成
    try {
      await taskRepo.createTab(newTask.id);
    } catch (error) {
      console.error('Failed to create initial tab:', error);
      // タブエラーもタスク作成失敗にはしない
    }

    // 更新後のタスクを取得
    const updatedTask = await taskRepo.getTask(newTask.id);

    // SSE broadcast
    sseManager.broadcast('task:created', updatedTask);

    return NextResponse.json({ data: { task: updatedTask } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
