import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { SessionData } from './types';

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

// sessions.json型（辞書形式）
type SessionsStore = Record<string, SessionData>;

// ファイルの原子的な読み込み
async function readSessions(): Promise<SessionsStore> {
  try {
    const content = await fs.readFile(SESSIONS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

// ファイルの原子的な書き込み
async function writeSessions(sessions: SessionsStore): Promise<void> {
  const dir = path.dirname(SESSIONS_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = `${SESSIONS_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(sessions, null, 2), 'utf-8');
  await fs.rename(tmpFile, SESSIONS_FILE);
}

// セッションデータ取得
export async function getSessionData(tab_id: string): Promise<SessionData | null> {
  return queue.add(async () => {
    const sessions = await readSessions();
    return sessions[tab_id] || null;
  });
}

// セッションデータ作成
export async function createSessionData(tab_id: string): Promise<SessionData> {
  return queue.add(async () => {
    const sessions = await readSessions();
    const newSessionData: SessionData = { rawMessages: [] };
    sessions[tab_id] = newSessionData;
    await writeSessions(sessions);
    return newSessionData;
  });
}

// セッションデータ更新
export async function updateSessionData(
  tab_id: string,
  updates: Partial<SessionData>
): Promise<SessionData | null> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (!sessions[tab_id]) return null;

    sessions[tab_id] = {
      ...sessions[tab_id],
      ...updates,
    };
    await writeSessions(sessions);
    return sessions[tab_id];
  });
}

// セッションデータ削除
export async function deleteSessionData(tab_id: string): Promise<boolean> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (!sessions[tab_id]) return false;

    delete sessions[tab_id];
    await writeSessions(sessions);
    return true;
  });
}

// メッセージ追加
export async function appendMessage(tab_id: string, message: unknown): Promise<SessionData | null> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (!sessions[tab_id]) return null;

    sessions[tab_id].rawMessages.push(message);
    await writeSessions(sessions);
    return sessions[tab_id];
  });
}
