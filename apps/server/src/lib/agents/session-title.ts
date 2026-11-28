import { open, readFile } from 'fs/promises';

/**
 * エージェントのセッションタイトルを、エージェントが書き出すファイルから読む。
 * どちらも公開されていない内部フォーマットのため、読めなければ null を返すだけにする
 */

/**
 * transcript の末尾から読む量。タイトルの行は会話の途中で繰り返し書かれるため末尾だけを見る
 * （ターンごとに読むので、長い transcript 全体は読まない）
 */
const TAIL_BYTES = 2 * 1024 * 1024;

async function readTail(filePath: string, bytes: number): Promise<string> {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

/** text 中で `"type":"<type>"` を含む最後の行を JSON として返す */
function lastEntryOfType(text: string, type: string): Record<string, unknown> | null {
  const marker = `"type":"${type}"`;
  let index = text.lastIndexOf(marker);
  while (index !== -1) {
    const lineStart = text.lastIndexOf('\n', index) + 1;
    const lineEndRaw = text.indexOf('\n', index);
    const line = text.slice(lineStart, lineEndRaw === -1 ? undefined : lineEndRaw);
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type === type) return entry;
    } catch {
      // 末尾読みで切れた行・本文中の文字列としての一致は飛ばす
    }
    index = lineStart > 0 ? text.lastIndexOf(marker, lineStart - 1) : -1;
  }
  return null;
}

function pickTitle(text: string): string | null {
  // /rename で付けた名前を、自動で付いたタイトルより優先する
  const custom = lastEntryOfType(text, 'custom-title')?.customTitle;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  const ai = lastEntryOfType(text, 'ai-title')?.aiTitle;
  if (typeof ai === 'string' && ai.trim()) return ai.trim();
  return null;
}

/** Claude Code の transcript（JSONL）からセッションタイトルを読む */
export async function readClaudeTranscriptTitle(transcriptPath: string): Promise<string | null> {
  try {
    return pickTitle(await readTail(transcriptPath, TAIL_BYTES));
  } catch {
    return null;
  }
}

/** Codex の session_index.jsonl から、スレッドIDに対応する最新の thread_name を読む */
export async function readCodexThreadName(
  sessionIndexPath: string,
  threadId: string
): Promise<string | null> {
  try {
    const text = await readFile(sessionIndexPath, 'utf8');
    let name: string | null = null;
    for (const line of text.split('\n')) {
      if (!line.includes(threadId)) continue;
      try {
        const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
        if (entry.id === threadId && typeof entry.thread_name === 'string') {
          name = entry.thread_name.trim() || name;
        }
      } catch {
        // 壊れた行は飛ばす
      }
    }
    return name;
  } catch {
    return null;
  }
}
