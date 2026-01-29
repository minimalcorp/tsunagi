import { prisma } from '../db';
import type { SessionData, MergedMessage, SimplifiedUserMessage } from '../types';

// セッションデータ取得
export async function getSessionData(tab_id: string): Promise<SessionData | null> {
  const data = await prisma.sessionData.findUnique({
    where: { tabId: tab_id },
  });

  if (!data) return null;

  return {
    sdkMessages: JSON.parse(data.sdkMessages),
    prompts: JSON.parse(data.prompts),
    nextSequence: data.nextSequence,
  };
}

// セッションデータ作成
export async function createSessionData(tab_id: string): Promise<SessionData> {
  const newSessionData: SessionData = {
    sdkMessages: [],
    prompts: [],
    nextSequence: 1,
  };

  await prisma.sessionData.create({
    data: {
      tabId: tab_id,
      sdkMessages: JSON.stringify(newSessionData.sdkMessages),
      prompts: JSON.stringify(newSessionData.prompts),
      nextSequence: newSessionData.nextSequence,
    },
  });

  return newSessionData;
}

// セッションデータ更新
export async function updateSessionData(
  tab_id: string,
  updates: Partial<SessionData>
): Promise<SessionData | null> {
  const existing = await getSessionData(tab_id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
  };

  await prisma.sessionData.update({
    where: { tabId: tab_id },
    data: {
      sdkMessages: JSON.stringify(updated.sdkMessages),
      prompts: JSON.stringify(updated.prompts),
      nextSequence: updated.nextSequence,
    },
  });

  return updated;
}

// セッションデータ削除
export async function deleteSessionData(tab_id: string): Promise<boolean> {
  try {
    await prisma.sessionData.delete({
      where: { tabId: tab_id },
    });
    return true;
  } catch {
    return false;
  }
}

// メッセージ追加
export async function appendMessage(
  tab_id: string,
  message: unknown
): Promise<{ sessionData: SessionData | null; sequence: number }> {
  const sessionData = await getSessionData(tab_id);
  if (!sessionData) return { sessionData: null, sequence: -1 };

  // nextSequenceを初期化（既存データの互換性対応）
  if (sessionData.nextSequence === undefined) {
    sessionData.nextSequence = 1;
  }

  // シーケンス番号を取得・インクリメント
  const sequence = sessionData.nextSequence!;
  sessionData.nextSequence = sequence + 1;

  // タイムスタンプとシーケンス番号を付与
  if (typeof message === 'object' && message !== null) {
    const msg = message as { created_at?: string; _sequence?: number };
    if (!msg.created_at) {
      (msg as { created_at: string }).created_at = new Date().toISOString();
    }
    (msg as { _sequence: number })._sequence = sequence;
  }

  sessionData.sdkMessages.push(message);

  await prisma.sessionData.update({
    where: { tabId: tab_id },
    data: {
      sdkMessages: JSON.stringify(sessionData.sdkMessages),
      nextSequence: sessionData.nextSequence,
    },
  });

  return { sessionData, sequence };
}

// ユーザープロンプト追加
export async function appendUserPrompt(
  tab_id: string,
  prompt: string
): Promise<{ sessionData: SessionData | null; sequence: number }> {
  const sessionData = await getSessionData(tab_id);
  if (!sessionData) return { sessionData: null, sequence: -1 };

  // 後方互換性のため、promptsが存在しない場合は初期化
  if (!sessionData.prompts) {
    sessionData.prompts = [];
  }

  // nextSequenceを初期化（既存データの互換性対応）
  if (sessionData.nextSequence === undefined) {
    sessionData.nextSequence = 1;
  }

  // シーケンス番号を取得・インクリメント
  const sequence = sessionData.nextSequence!;
  sessionData.nextSequence = sequence + 1;

  sessionData.prompts.push({
    created_at: new Date().toISOString(),
    prompt,
    _sequence: sequence,
  });

  await prisma.sessionData.update({
    where: { tabId: tab_id },
    data: {
      prompts: JSON.stringify(sessionData.prompts),
      nextSequence: sessionData.nextSequence,
    },
  });

  return { sessionData, sequence };
}

/**
 * タブのマージ済みメッセージを取得
 * promptsとsdkMessagesをマージし、シーケンス番号でソート
 */
export async function getMergedMessages(tab_id: string): Promise<MergedMessage[]> {
  const sessionData = await getSessionData(tab_id);
  if (!sessionData) return [];

  // promptsまたはsdkMessagesがundefinedの場合の対応
  const prompts = sessionData.prompts || [];
  const sdkMessages = sessionData.sdkMessages || [];

  // UserPromptをpromptメッセージ形式に変換
  const userMessages: (SimplifiedUserMessage & {
    _sequence: number;
    _sourceIndex: number;
    _source: 'userPrompt';
  })[] = prompts.map((up, index) => ({
    type: 'prompt' as const,
    created_at: up.created_at,
    message: { content: up.prompt },
    _sequence: up._sequence ?? index + 1,
    _sourceIndex: index,
    _source: 'userPrompt' as const,
  }));

  // sdkMessagesにメタデータを付与
  const rawMessagesWithMeta = sdkMessages.map((msg, index) => {
    if (typeof msg === 'object' && msg !== null) {
      const msgObj = msg as Record<string, unknown>;
      return {
        ...msgObj,
        _sequence: (msgObj._sequence as number | undefined) ?? index + prompts.length + 1,
        _sourceIndex: index,
        _source: 'rawMessage' as const,
      };
    }
    return {
      _sequence: index + prompts.length + 1,
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
      return rest as MergedMessage;
    }
    return msg as MergedMessage;
  });
}
