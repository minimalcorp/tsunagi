/**
 * コンテキスト長（トークン数）の入力・表示用。`64k` / `1m` のような短い表記と整数を相互変換する。
 * Ollama / LM Studio の慣習（64k = 65536）に合わせ、k = 1024、m = 1024² とする。
 */

const UNITS: Record<string, number> = { k: 1024, m: 1024 * 1024 };

/** 入力候補 */
export const CONTEXT_LENGTH_PRESETS = [32768, 65536, 131072, 262144];

/** `64k` / `128K` / `1m` / `65536` / `65,536` を整数に変換する。不正なら null */
export function parseContextLength(input: string): number | null {
  const match = input
    .trim()
    .replace(/[,_\s]/g, '')
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? UNITS[match[2]] : 1);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** 整数を `64k` のような短い表記にする（1024 で割り切れない値は整数のまま） */
export function formatContextLength(tokens: number): string {
  if (tokens >= UNITS.m && tokens % UNITS.m === 0) return `${tokens / UNITS.m}m`;
  if (tokens >= UNITS.k && tokens % UNITS.k === 0) return `${tokens / UNITS.k}k`;
  return String(tokens);
}
