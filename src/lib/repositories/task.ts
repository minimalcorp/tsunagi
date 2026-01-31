import { prisma } from '../db';
import type { Task, Tab } from '../types';
import { createSessionData, deleteSessionData } from './tab';

// タスク一覧取得（deleted: false のみデフォルト）
export async function getTasks(filter?: {
  includeDeleted?: boolean;
  status?: Task['status'];
  owner?: string;
  repo?: string;
  updatedBefore?: Date;
}): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: {
      ...(filter?.includeDeleted ? {} : { deletedAt: null }),
      ...(filter?.status && { status: filter.status }),
      ...(filter?.owner && { owner: filter.owner }),
      ...(filter?.repo && { repo: filter.repo }),
      ...(filter?.updatedBefore && { updatedAt: { lt: filter.updatedBefore } }),
    },
    include: {
      tabs: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return tasks.map((task) => ({
    id: task.id,
    status: task.status as Task['status'],
    title: task.title,
    description: task.description,
    owner: task.owner,
    repo: task.repo,
    branch: task.branch,
    baseBranch: task.baseBranch,
    baseBranchCommit: task.baseBranchCommit ?? undefined,
    repoId: task.repoId,
    worktreeStatus: task.worktreeStatus as Task['worktreeStatus'],
    requirement: task.requirement ?? undefined,
    design: task.design ?? undefined,
    procedure: task.procedure ?? undefined,
    pullRequestUrl: task.pullRequestUrl ?? undefined,
    effort: task.effort ?? undefined,
    order: task.order ?? undefined,
    deletedAt: task.deletedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    tabs: task.tabs.map((tab) => ({
      tab_id: tab.tabId,
      order: tab.order,
      status: tab.status as Tab['status'],
      session_id: tab.sessionId ?? undefined,
      promptCount: tab.promptCount ?? undefined,
      startedAt: tab.startedAt.toISOString(),
      completedAt: tab.completedAt?.toISOString(),
      updatedAt: tab.updatedAt.toISOString(),
    })),
  }));
}

// タスク取得
export async function getTask(id: string): Promise<Task | null> {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      tabs: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!task) return null;

  return {
    id: task.id,
    status: task.status as Task['status'],
    title: task.title,
    description: task.description,
    owner: task.owner,
    repo: task.repo,
    branch: task.branch,
    baseBranch: task.baseBranch,
    baseBranchCommit: task.baseBranchCommit ?? undefined,
    repoId: task.repoId,
    worktreeStatus: task.worktreeStatus as Task['worktreeStatus'],
    requirement: task.requirement ?? undefined,
    design: task.design ?? undefined,
    procedure: task.procedure ?? undefined,
    pullRequestUrl: task.pullRequestUrl ?? undefined,
    effort: task.effort ?? undefined,
    order: task.order ?? undefined,
    deletedAt: task.deletedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    tabs: task.tabs.map((tab) => ({
      tab_id: tab.tabId,
      order: tab.order,
      status: tab.status as Tab['status'],
      session_id: tab.sessionId ?? undefined,
      promptCount: tab.promptCount ?? undefined,
      startedAt: tab.startedAt.toISOString(),
      completedAt: tab.completedAt?.toISOString(),
      updatedAt: tab.updatedAt.toISOString(),
    })),
  };
}

// タスク作成
export async function createTask(
  task: Omit<Task, 'id' | 'deleted' | 'deletedAt' | 'createdAt' | 'updatedAt' | 'tabs'>
): Promise<Task> {
  const newTask = await prisma.task.create({
    data: {
      status: task.status,
      title: task.title,
      description: task.description,
      owner: task.owner,
      repo: task.repo,
      branch: task.branch,
      baseBranch: task.baseBranch,
      baseBranchCommit: task.baseBranchCommit,
      repoId: task.repoId,
      worktreeStatus: task.worktreeStatus,
      requirement: task.requirement,
      design: task.design,
      procedure: task.procedure,
      pullRequestUrl: task.pullRequestUrl,
      effort: task.effort,
      order: task.order,
    },
    include: {
      tabs: true,
    },
  });

  return {
    id: newTask.id,
    status: newTask.status as Task['status'],
    title: newTask.title,
    description: newTask.description,
    owner: newTask.owner,
    repo: newTask.repo,
    branch: newTask.branch,
    baseBranch: newTask.baseBranch,
    repoId: newTask.repoId,
    worktreeStatus: newTask.worktreeStatus as Task['worktreeStatus'],
    requirement: newTask.requirement ?? undefined,
    design: newTask.design ?? undefined,
    procedure: newTask.procedure ?? undefined,
    pullRequestUrl: newTask.pullRequestUrl ?? undefined,
    effort: newTask.effort ?? undefined,
    order: newTask.order ?? undefined,
    deletedAt: newTask.deletedAt?.toISOString(),
    createdAt: newTask.createdAt.toISOString(),
    updatedAt: newTask.updatedAt.toISOString(),
    tabs: [],
  };
}

// タスク更新
export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, 'id' | 'createdAt'>>
): Promise<Task | null> {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return null;

  const updatedTask = await prisma.task.update({
    where: { id },
    data: {
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.branch !== undefined && { branch: updates.branch }),
      ...(updates.baseBranch !== undefined && { baseBranch: updates.baseBranch }),
      ...(updates.baseBranchCommit !== undefined && {
        baseBranchCommit: updates.baseBranchCommit,
      }),
      ...(updates.requirement !== undefined && { requirement: updates.requirement }),
      ...(updates.design !== undefined && { design: updates.design }),
      ...(updates.procedure !== undefined && { procedure: updates.procedure }),
      ...(updates.pullRequestUrl !== undefined && { pullRequestUrl: updates.pullRequestUrl }),
      ...(updates.effort !== undefined && { effort: updates.effort }),
      ...(updates.order !== undefined && { order: updates.order }),
    },
    include: {
      tabs: {
        orderBy: { order: 'asc' },
      },
    },
  });

  return {
    id: updatedTask.id,
    status: updatedTask.status as Task['status'],
    title: updatedTask.title,
    description: updatedTask.description,
    owner: updatedTask.owner,
    repo: updatedTask.repo,
    branch: updatedTask.branch,
    baseBranch: updatedTask.baseBranch,
    repoId: updatedTask.repoId,
    worktreeStatus: updatedTask.worktreeStatus as Task['worktreeStatus'],
    requirement: updatedTask.requirement ?? undefined,
    design: updatedTask.design ?? undefined,
    procedure: updatedTask.procedure ?? undefined,
    pullRequestUrl: updatedTask.pullRequestUrl ?? undefined,
    effort: updatedTask.effort ?? undefined,
    order: updatedTask.order ?? undefined,
    deletedAt: updatedTask.deletedAt?.toISOString(),
    createdAt: updatedTask.createdAt.toISOString(),
    updatedAt: updatedTask.updatedAt.toISOString(),
    tabs: updatedTask.tabs.map((tab) => ({
      tab_id: tab.tabId,
      order: tab.order,
      status: tab.status as Tab['status'],
      session_id: tab.sessionId ?? undefined,
      promptCount: tab.promptCount ?? undefined,
      startedAt: tab.startedAt.toISOString(),
      completedAt: tab.completedAt?.toISOString(),
      updatedAt: tab.updatedAt.toISOString(),
    })),
  };
}

// タスク論理削除
export async function deleteTask(id: string): Promise<boolean> {
  try {
    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// タブCRUD操作
// ============================================

// タブ作成
export async function createTab(taskId: string): Promise<Tab | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { tabs: true },
  });

  if (!task) return null;

  // orderを決定（既存タブの最大値+1）
  const maxOrder = task.tabs.reduce((max, tab) => Math.max(max, tab.order), 0);
  const order = maxOrder + 1;

  const tabId = crypto.randomUUID();

  const newTab = await prisma.tab.create({
    data: {
      tabId,
      taskId,
      order,
      status: 'idle',
      startedAt: new Date(),
    },
  });

  // sessions.jsonも初期化
  await createSessionData(newTab.tabId);

  return {
    tab_id: newTab.tabId,
    order: newTab.order,
    status: newTab.status as Tab['status'],
    session_id: newTab.sessionId ?? undefined,
    promptCount: newTab.promptCount ?? undefined,
    startedAt: newTab.startedAt.toISOString(),
    completedAt: newTab.completedAt?.toISOString(),
    updatedAt: newTab.updatedAt.toISOString(),
  };
}

// タブ取得
export async function getTab(taskId: string, tab_id: string): Promise<Tab | null> {
  const tab = await prisma.tab.findFirst({
    where: { taskId, tabId: tab_id },
  });

  if (!tab) return null;

  return {
    tab_id: tab.tabId,
    order: tab.order,
    status: tab.status as Tab['status'],
    session_id: tab.sessionId ?? undefined,
    promptCount: tab.promptCount ?? undefined,
    startedAt: tab.startedAt.toISOString(),
    completedAt: tab.completedAt?.toISOString(),
    updatedAt: tab.updatedAt.toISOString(),
  };
}

// タブ更新
export async function updateTab(
  taskId: string,
  tab_id: string,
  updates: Partial<Omit<Tab, 'tab_id' | 'order' | 'startedAt'>>
): Promise<Tab | null> {
  const tab = await prisma.tab.findFirst({
    where: { taskId, tabId: tab_id },
  });

  if (!tab) return null;

  const updatedTab = await prisma.tab.update({
    where: { tabId: tab_id },
    data: {
      ...(updates.status && { status: updates.status }),
      ...(updates.session_id !== undefined && { sessionId: updates.session_id }),
      ...(updates.promptCount !== undefined && { promptCount: updates.promptCount }),
      ...(updates.completedAt !== undefined && {
        completedAt: updates.completedAt ? new Date(updates.completedAt) : null,
      }),
    },
  });

  return {
    tab_id: updatedTab.tabId,
    order: updatedTab.order,
    status: updatedTab.status as Tab['status'],
    session_id: updatedTab.sessionId ?? undefined,
    promptCount: updatedTab.promptCount ?? undefined,
    startedAt: updatedTab.startedAt.toISOString(),
    completedAt: updatedTab.completedAt?.toISOString(),
    updatedAt: updatedTab.updatedAt.toISOString(),
  };
}

// タブ削除
export async function deleteTab(taskId: string, tab_id: string): Promise<boolean> {
  try {
    const tab = await prisma.tab.findFirst({
      where: { taskId, tabId: tab_id },
    });

    if (!tab) return false;

    await prisma.tab.delete({ where: { tabId: tab_id } });

    // sessions.jsonからも削除
    await deleteSessionData(tab_id);

    return true;
  } catch {
    return false;
  }
}

// ============================================
// Claude Tool関数（タスクワークフロー用）
// ============================================

/**
 * タスクの計画ドキュメント（requirement, design, procedure）を更新
 * Claudeがplanning時に使用
 */
export async function updateTaskPlans(
  taskId: string,
  plans: {
    requirement: string;
    design: string;
    procedure: string;
  }
): Promise<Task | null> {
  return updateTask(taskId, {
    requirement: plans.requirement,
    design: plans.design,
    procedure: plans.procedure,
  });
}

/**
 * タスクステータスを遷移させる
 * Claudeが実装完了時にreviewing へ自動遷移する際に使用
 */
export async function transitionTaskStatus(
  taskId: string,
  newStatus: Task['status'],
  data?: { pullRequestUrl?: string }
): Promise<Task | null> {
  return updateTask(taskId, {
    status: newStatus,
    ...(data?.pullRequestUrl && { pullRequestUrl: data.pullRequestUrl }),
  });
}

/**
 * タスクを完了する
 * Pull Requestをマージし、タスクをdoneステータスに遷移
 */
export async function completeTask(taskId: string): Promise<Task | null> {
  const task = await getTask(taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // TODO: PRマージ処理を実装（gh CLIを使用）
  // if (task.pullRequestUrl) {
  //   const prNumber = extractPRNumber(task.pullRequestUrl);
  //   try {
  //     await execCommand(`gh pr merge ${prNumber} --merge`);
  //   } catch (error) {
  //     console.warn('PR merge failed or already merged:', error);
  //   }
  // }

  // タスクをdoneに遷移
  return updateTask(taskId, {
    status: 'done',
  });
}
