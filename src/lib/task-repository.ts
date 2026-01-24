import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Task } from './types';

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
  task: Omit<Task, 'id' | 'deleted' | 'createdAt' | 'updatedAt'>
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
