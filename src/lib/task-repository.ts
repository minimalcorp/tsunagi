import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Task, Tab } from './types';
import { createSessionData, deleteSessionData } from './tab-repository';

const TASKS_FILE = path.join(os.homedir(), '.tsunagi', 'state', 'tasks.json');

// Queue機構（レースコンディション対策）
class Queue {
  private queue: (() => Promise<void>)[] = [];
  private running = false;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) await task();
    }

    this.running = false;
  }
}

const queue = new Queue();

// ファイルの原子的な読み込み
async function readTasks(): Promise<Task[]> {
  try {
    const content = await fs.readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// ファイルの原子的な書き込み
async function writeTasks(tasks: Task[]): Promise<void> {
  const dir = path.dirname(TASKS_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = `${TASKS_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(tasks, null, 2), 'utf-8');
  await fs.rename(tmpFile, TASKS_FILE);
}

// タスク一覧取得（deleted: false のみデフォルト）
export async function getTasks(filter?: {
  includeDeleted?: boolean;
  status?: Task['status'];
  owner?: string;
  repo?: string;
}): Promise<Task[]> {
  return queue.add(async () => {
    const tasks = await readTasks();
    return tasks.filter((task) => {
      if (!filter?.includeDeleted && task.deleted) return false;
      if (filter?.status && task.status !== filter.status) return false;
      if (filter?.owner && task.owner !== filter.owner) return false;
      if (filter?.repo && task.repo !== filter.repo) return false;
      return true;
    });
  });
}

// タスク取得
export async function getTask(id: string): Promise<Task | null> {
  return queue.add(async () => {
    const tasks = await readTasks();
    return tasks.find((task) => task.id === id) || null;
  });
}

// タスク作成
export async function createTask(
  task: Omit<Task, 'id' | 'deleted' | 'createdAt' | 'updatedAt' | 'tabs'>
): Promise<Task> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      deleted: false,
      createdAt: now,
      updatedAt: now,
      tabs: [], // 空配列で初期化
    };
    tasks.push(newTask);
    await writeTasks(tasks);
    return newTask;
  });
}

// タスク更新
export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, 'id' | 'createdAt'>>
): Promise<Task | null> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;

    const updatedTask: Task = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    tasks[index] = updatedTask;
    await writeTasks(tasks);
    return updatedTask;
  });
}

// タスク論理削除
export async function deleteTask(id: string): Promise<boolean> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;

    tasks[index].deleted = true;
    tasks[index].deletedAt = new Date().toISOString();
    tasks[index].updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    return true;
  });
}

// ============================================
// タブCRUD操作（Phase 1で追加）
// ============================================

// タブ作成
export async function createTab(taskId: string): Promise<Tab | null> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;

    // sessionNumberを決定（既存タブの最大値+1）
    const maxSessionNumber =
      task.tabs?.reduce((max, tab) => Math.max(max, tab.sessionNumber), 0) || 0;
    const sessionNumber = maxSessionNumber + 1;

    const now = new Date().toISOString();
    const newTab: Tab = {
      tab_id: crypto.randomUUID(),
      sessionNumber,
      status: 'idle',
      startedAt: now,
      updatedAt: now,
    };

    // タスクにタブを追加
    if (!task.tabs) task.tabs = [];
    task.tabs.push(newTab);
    task.updatedAt = now;

    // sessions.jsonも初期化
    await createSessionData(newTab.tab_id);

    await writeTasks(tasks);
    return newTab;
  });
}

// タブ取得
export async function getTab(taskId: string, tab_id: string): Promise<Tab | null> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;

    return task.tabs?.find((tab) => tab.tab_id === tab_id) || null;
  });
}

// タブ更新
export async function updateTab(
  taskId: string,
  tab_id: string,
  updates: Partial<Omit<Tab, 'tab_id' | 'sessionNumber' | 'startedAt'>>
): Promise<Tab | null> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.tabs) return null;

    const tabIndex = task.tabs.findIndex((tab) => tab.tab_id === tab_id);
    if (tabIndex === -1) return null;

    const updatedTab: Tab = {
      ...task.tabs[tabIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    task.tabs[tabIndex] = updatedTab;
    task.updatedAt = new Date().toISOString();

    await writeTasks(tasks);
    return updatedTab;
  });
}

// タブ削除
export async function deleteTab(taskId: string, tab_id: string): Promise<boolean> {
  return queue.add(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.tabs) return false;

    const tabIndex = task.tabs.findIndex((tab) => tab.tab_id === tab_id);
    if (tabIndex === -1) return false;

    // タスクからタブを削除
    task.tabs.splice(tabIndex, 1);
    task.updatedAt = new Date().toISOString();

    // sessions.jsonからも削除
    await deleteSessionData(tab_id);

    await writeTasks(tasks);
    return true;
  });
}
