import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { SessionData, MergedMessage, SimplifiedUserMessage } from './types';

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
    const newSessionData: SessionData = {
      rawMessages: [],
      userPrompts: [],
    };
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

    // タイムスタンプを付与（既存のフィールドがない場合のみ）
    if (typeof message === 'object' && message !== null) {
      const msg = message as { created_at?: string };
      if (!msg.created_at) {
        (msg as { created_at: string }).created_at = new Date().toISOString();
      }
    }

    sessions[tab_id].rawMessages.push(message);
    await writeSessions(sessions);
    return sessions[tab_id];
  });
}

// ユーザープロンプト追加
export async function appendUserPrompt(
  tab_id: string,
  prompt: string
): Promise<SessionData | null> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (!sessions[tab_id]) return null;

    // 後方互換性のため、userPromptsが存在しない場合は初期化
    if (!sessions[tab_id].userPrompts) {
      sessions[tab_id].userPrompts = [];
    }

    sessions[tab_id].userPrompts.push({
      created_at: new Date().toISOString(),
      prompt,
    });

    await writeSessions(sessions);
    return sessions[tab_id];
  });
}

/**
 * タブのマージ済みメッセージを取得
 * userPromptsとrawMessagesをマージし、タイムスタンプでソート
 */
export async function getMergedMessages(tab_id: string): Promise<MergedMessage[]> {
  const sessionData = await getSessionData(tab_id);
  if (!sessionData) return [];

  // UserPromptをpromptメッセージ形式に変換
  const userMessages: (SimplifiedUserMessage & {
    _sourceIndex: number;
    _source: 'userPrompt';
  })[] = sessionData.userPrompts.map((up, index) => ({
    type: 'prompt' as const,
    created_at: up.created_at,
    message: { content: up.prompt },
    _sourceIndex: index,
    _source: 'userPrompt' as const,
  }));

  // rawMessagesにメタデータを付与
  const rawMessagesWithMeta = sessionData.rawMessages.map((msg, index) => {
    if (typeof msg === 'object' && msg !== null) {
      return {
        ...(msg as Record<string, unknown>),
        _sourceIndex: index,
        _source: 'rawMessage' as const,
      };
    }
    return {
      _sourceIndex: index,
      _source: 'rawMessage' as const,
    };
  });

  // マージしてタイムスタンプでソート
  const messages = [...userMessages, ...rawMessagesWithMeta];

  messages.sort((a, b) => {
    const getTimestamp = (msg: unknown): string => {
      if (typeof msg === 'object' && msg !== null) {
        const obj = msg as { created_at?: string; started_at?: string };
        return obj.created_at || obj.started_at || '';
      }
      return '';
    };

    const timeA = getTimestamp(a);
    const timeB = getTimestamp(b);

    // 両方にタイムスタンプがある場合：タイムスタンプでソート
    if (timeA && timeB) {
      return timeA.localeCompare(timeB);
    }

    // 片方だけタイムスタンプがある場合：タイムスタンプがある方を先に
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;

    // 両方タイムスタンプがない場合：元の配列順序を維持
    const metaA = a as { _source: 'userPrompt' | 'rawMessage'; _sourceIndex: number };
    const metaB = b as { _source: 'userPrompt' | 'rawMessage'; _sourceIndex: number };

    // 同じソースの場合はインデックス順
    if (metaA._source === metaB._source) {
      return metaA._sourceIndex - metaB._sourceIndex;
    }

    // 異なるソースの場合：rawMessageを先に（既存の動作を維持）
    return metaA._source === 'rawMessage' ? -1 : 1;
  });

  // メタデータを削除
  return messages.map((msg) => {
    if (typeof msg === 'object' && msg !== null) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _sourceIndex, _source, ...rest } = msg as {
        _sourceIndex: number;
        _source: string;
      };
      return rest;
    }
    return msg;
  });
}
