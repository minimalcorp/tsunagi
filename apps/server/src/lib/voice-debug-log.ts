import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// apps/server直下(src/libとdist/libのどちらから見ても2階層上)に置く。
// docker-compose(compose.yml)ではリポジトリ全体がbind mountされているため、
// ホスト側からもこのファイルをそのまま読める(named volumeの~/.tsunagiとは違い、
// Claude Codeが次回セッションでRead/grepしてプロンプト改善の材料にできる)。
const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'voice-input-debug.log');

// デバッグ用途のため肥大化を防ぐ簡易ローテーション(直近件数のみ保持)。
const MAX_ENTRIES = 200;

export interface VoiceDebugLogEntry {
  whisperPrompt: string | undefined;
  whisperText: string;
  useLlm: boolean;
  llmSystemPrompt?: string;
  correctedText?: string;
  llmError?: string;
}

// Whisper生テキストとLLM整形結果を1リクエスト1行(JSON Lines)で追記する。
// プロンプト改善のデバッグ専用ログであり、書き込み失敗はリクエスト自体を
// 失敗させるべきではないため例外を握りつぶす。
export function appendVoiceDebugLog(entry: VoiceDebugLogEntry): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
    fs.appendFileSync(LOG_FILE, `${line}\n`);

    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
    if (lines.length > MAX_ENTRIES) {
      fs.writeFileSync(LOG_FILE, `${lines.slice(-MAX_ENTRIES).join('\n')}\n`);
    }
  } catch {
    // デバッグログの書き込み失敗は無視する(本処理に影響させない)。
  }
}
