import { prisma } from '../db';
import type { Task, Tab } from '../types';

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

  return tasks.map((task) => mapTask(task));
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

  return mapTask(task);
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
      pullRequestUrl: task.pullRequestUrl,
      effort: task.effort,
      order: task.order,
    },
    include: {
      tabs: true,
    },
  });

  return mapTask(newTask);
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
      ...(updates.worktreeStatus !== undefined && { worktreeStatus: updates.worktreeStatus }),
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

  return mapTask(updatedTask);
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

  return mapTab(newTab);
}

// タブ取得
export async function getTab(taskId: string, tab_id: string): Promise<Tab | null> {
  const tab = await prisma.tab.findFirst({
    where: { taskId, tabId: tab_id },
  });

  if (!tab) return null;

  return mapTab(tab);
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
      ...(updates.completedAt !== undefined && {
        completedAt: updates.completedAt ? new Date(updates.completedAt) : null,
      }),
    },
  });

  return mapTab(updatedTab);
}

// タブ削除
export async function deleteTab(taskId: string, tab_id: string): Promise<boolean> {
  try {
    const tab = await prisma.tab.findFirst({
      where: { taskId, tabId: tab_id },
    });

    if (!tab) return false;

    await prisma.tab.delete({ where: { tabId: tab_id } });

    return true;
  } catch {
    return false;
  }
}

// ============================================
// Claude Tool関数（タスクワークフロー用）
// ============================================

/**
 * タスクステータスを遷移させる
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
 */
export async function completeTask(taskId: string): Promise<Task | null> {
  const task = await getTask(taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  return updateTask(taskId, {
    status: 'done',
  });
}

// ============================================
// 内部ヘルパー
// ============================================

type PrismaTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
  baseBranchCommit: string | null;
  repoId: string;
  worktreeStatus: string;
  pullRequestUrl: string | null;
  effort: number | null;
  order: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tabs: PrismaTab[];
};

type PrismaTab = {
  tabId: string;
  order: number;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

function mapTask(task: PrismaTask): Task {
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
    pullRequestUrl: task.pullRequestUrl ?? undefined,
    effort: task.effort ?? undefined,
    order: task.order ?? undefined,
    deletedAt: task.deletedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    tabs: task.tabs.map((tab) => mapTab(tab)),
  };
}

function mapTab(tab: PrismaTab): Tab {
  return {
    tab_id: tab.tabId,
    order: tab.order,
    status: tab.status as Tab['status'],
    startedAt: tab.startedAt.toISOString(),
    completedAt: tab.completedAt?.toISOString(),
    updatedAt: tab.updatedAt.toISOString(),
  };
}
