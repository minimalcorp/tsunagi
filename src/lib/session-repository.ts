import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ClaudeSession } from './types';

const SESSIONS_FILE = path.join(os.homedir(), '.tsunagi', 'state', 'sessions.json');

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
async function readSessions(): Promise<ClaudeSession[]> {
  try {
    const content = await fs.readFile(SESSIONS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// ファイルの原子的な書き込み
async function writeSessions(sessions: ClaudeSession[]): Promise<void> {
  const dir = path.dirname(SESSIONS_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = `${SESSIONS_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(sessions, null, 2), 'utf-8');
  await fs.rename(tmpFile, SESSIONS_FILE);
}

// セッション一覧取得
export async function getSessions(taskId?: string): Promise<ClaudeSession[]> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (taskId) {
      return sessions.filter((session) => session.taskId === taskId);
    }
    return sessions;
  });
}

// セッション取得
export async function getSession(id: string): Promise<ClaudeSession | null> {
  return queue.add(async () => {
    const sessions = await readSessions();
    return sessions.find((session) => session.id === id) || null;
  });
}

// セッション作成
export async function createSession(
  session: Omit<ClaudeSession, 'id' | 'sessionNumber' | 'startedAt' | 'updatedAt'>
): Promise<ClaudeSession> {
  return queue.add(async () => {
    const sessions = await readSessions();
    const now = new Date().toISOString();

    // 同じタスクの既存セッションの最大sessionNumberを取得
    const taskSessions = sessions.filter((s) => s.taskId === session.taskId);
    const maxSessionNumber = taskSessions.reduce(
      (max, s) => Math.max(max, s.sessionNumber || 0),
      0
    );

    const newSession: ClaudeSession = {
      ...session,
      id: crypto.randomUUID(),
      sessionNumber: maxSessionNumber + 1,
      startedAt: now,
      updatedAt: now,
    };
    sessions.push(newSession);
    await writeSessions(sessions);
    return newSession;
  });
}

// セッション更新
export async function updateSession(
  id: string,
  updates: Partial<Omit<ClaudeSession, 'id' | 'taskId' | 'startedAt'>>
): Promise<ClaudeSession | null> {
  return queue.add(async () => {
    const sessions = await readSessions();
    const index = sessions.findIndex((session) => session.id === id);
    if (index === -1) return null;

    const updatedSession: ClaudeSession = {
      ...sessions[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    sessions[index] = updatedSession;
    await writeSessions(sessions);
    return updatedSession;
  });
}

// セッション削除
export async function deleteSession(id: string): Promise<boolean> {
  return queue.add(async () => {
    const sessions = await readSessions();
    const index = sessions.findIndex((session) => session.id === id);
    if (index === -1) return false;

    sessions.splice(index, 1);
    await writeSessions(sessions);
    return true;
  });
}
