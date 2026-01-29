import { prisma } from '../db';
import type { Task, Tab } from '../types';
import { createSessionData, deleteSessionData } from './tab';

// タスク一覧取得（deleted: false のみデフォルト）
export async function getTasks(filter?: {
  includeDeleted?: boolean;
  status?: Task['status'];
  owner?: string;
  repo?: string;
}): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: {
      ...(filter?.includeDeleted ? {} : { deletedAt: null }),
      ...(filter?.status && { status: filter.status }),
      ...(filter?.owner && { owner: filter.owner }),
      ...(filter?.repo && { repo: filter.repo }),
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
    repoId: task.repoId,
    worktreeStatus: task.worktreeStatus as Task['worktreeStatus'],
    plan: task.plan ?? undefined,
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
    repoId: task.repoId,
    worktreeStatus: task.worktreeStatus as Task['worktreeStatus'],
    plan: task.plan ?? undefined,
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
      repoId: task.repoId,
      worktreeStatus: task.worktreeStatus,
      plan: task.plan,
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
    repoId: newTask.repoId,
    worktreeStatus: newTask.worktreeStatus as Task['worktreeStatus'],
    plan: newTask.plan ?? undefined,
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
      ...(updates.status && { status: updates.status }),
      ...(updates.title && { title: updates.title }),
      ...(updates.branch && { branch: updates.branch }),
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
    repoId: updatedTask.repoId,
    worktreeStatus: updatedTask.worktreeStatus as Task['worktreeStatus'],
    plan: updatedTask.plan ?? undefined,
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
