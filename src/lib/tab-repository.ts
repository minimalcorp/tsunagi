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
      nextSequence: 1, // シーケンス番号を1から開始
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
export async function appendMessage(
  tab_id: string,
  message: unknown
): Promise<{ sessionData: SessionData | null; sequence: number }> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (!sessions[tab_id]) return { sessionData: null, sequence: -1 };

    // nextSequenceを初期化（既存データの互換性対応）
    if (sessions[tab_id].nextSequence === undefined) {
      sessions[tab_id].nextSequence = 1;
    }

    // シーケンス番号を取得・インクリメント
    const sequence = sessions[tab_id].nextSequence!;
    sessions[tab_id].nextSequence = sequence + 1;

    // タイムスタンプとシーケンス番号を付与
    if (typeof message === 'object' && message !== null) {
      const msg = message as { created_at?: string; _sequence?: number };
      if (!msg.created_at) {
        (msg as { created_at: string }).created_at = new Date().toISOString();
      }
      // シーケンス番号を追加（SDKメッセージそのままに_sequenceプロパティを追加）
      (msg as { _sequence: number })._sequence = sequence;
    }

    sessions[tab_id].rawMessages.push(message);
    await writeSessions(sessions);
    return { sessionData: sessions[tab_id], sequence };
  });
}

// ユーザープロンプト追加
export async function appendUserPrompt(
  tab_id: string,
  prompt: string
): Promise<{ sessionData: SessionData | null; sequence: number }> {
  return queue.add(async () => {
    const sessions = await readSessions();
    if (!sessions[tab_id]) return { sessionData: null, sequence: -1 };

    // 後方互換性のため、userPromptsが存在しない場合は初期化
    if (!sessions[tab_id].userPrompts) {
      sessions[tab_id].userPrompts = [];
    }

    // nextSequenceを初期化（既存データの互換性対応）
    if (sessions[tab_id].nextSequence === undefined) {
      sessions[tab_id].nextSequence = 1;
    }

    // シーケンス番号を取得・インクリメント
    const sequence = sessions[tab_id].nextSequence!;
    sessions[tab_id].nextSequence = sequence + 1;

    sessions[tab_id].userPrompts.push({
      created_at: new Date().toISOString(),
      prompt,
      _sequence: sequence, // シーケンス番号を追加
    });

    await writeSessions(sessions);
    return { sessionData: sessions[tab_id], sequence };
  });
}

/**
 * タブのマージ済みメッセージを取得
 * userPromptsとrawMessagesをマージし、シーケンス番号でソート
 */
export async function getMergedMessages(tab_id: string): Promise<MergedMessage[]> {
  const sessionData = await getSessionData(tab_id);
  if (!sessionData) return [];

  // UserPromptをpromptメッセージ形式に変換
  const userMessages: (SimplifiedUserMessage & {
    _sequence: number;
    _sourceIndex: number;
    _source: 'userPrompt';
  })[] = sessionData.userPrompts.map((up, index) => ({
    type: 'prompt' as const,
    created_at: up.created_at,
    message: { content: up.prompt },
    _sequence: up._sequence ?? index + 1, // フォールバック: 既存データは配列順
    _sourceIndex: index,
    _source: 'userPrompt' as const,
  }));

  // rawMessagesにメタデータを付与
  const rawMessagesWithMeta = sessionData.rawMessages.map((msg, index) => {
    if (typeof msg === 'object' && msg !== null) {
      const msgObj = msg as Record<string, unknown>;
      return {
        ...msgObj,
        _sequence:
          (msgObj._sequence as number | undefined) ?? index + sessionData.userPrompts.length + 1, // フォールバック
        _sourceIndex: index,
        _source: 'rawMessage' as const,
      };
    }
    return {
      _sequence: index + sessionData.userPrompts.length + 1,
      _sourceIndex: index,
      _source: 'rawMessage' as const,
    };
  });

  // マージしてシーケンス番号でソート
  const messages = [...userMessages, ...rawMessagesWithMeta];

  messages.sort((a, b) => {
    const seqA = (a as { _sequence?: number })._sequence || 0;
    const seqB = (b as { _sequence?: number })._sequence || 0;
    return seqA - seqB;
  });

  // メタデータを削除（_sequenceは保持）
  return messages.map((msg) => {
    if (typeof msg === 'object' && msg !== null) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _sourceIndex, _source, ...rest } = msg as {
        _sourceIndex: number;
        _source: string;
        _sequence: number;
      };
      return rest as MergedMessage; // _sequenceを含む
    }
    return msg as MergedMessage;
  });
}
