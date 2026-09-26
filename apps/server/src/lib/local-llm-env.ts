import { prisma } from './db.js';

/**
 * ローカルLLM（Ollama / LM Studio）の Anthropic 互換 API で Claude Code を動かすための共通処理。
 */

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** ローカルLLMタブでは Anthropic の認証情報を環境変数ごと取り除く（ANTHROPIC_AUTH_TOKEN と競合するため） */
export const LOCAL_LLM_UNSET_ENV_KEYS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

/** AppSetting から JSON 設定を読む。未保存・破損時は既定値 */
export async function readAppSetting<T extends object>(key: string, defaults: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return defaults;
  try {
    return { ...defaults, ...(JSON.parse(row.value) as Partial<T>) };
  } catch {
    return defaults;
  }
}

export async function writeAppSetting<T>(key: string, settings: T): Promise<T> {
  const value = JSON.stringify(settings);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return settings;
}

/** http(s) の URL を末尾スラッシュなしに正規化する。不正なら null */
export function normalizeBaseUrl(value: unknown): string | null {
  const baseUrl = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return baseUrl;
}

export function parseContextTokens(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** extraEnv を検証する。不正ならエラーメッセージ */
export function parseExtraEnv(value: unknown): { env: Record<string, string> } | { error: string } {
  const env: Record<string, string> = {};
  if (value === undefined) return { env };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'extraEnv must be an object' };
  }
  for (const [key, v] of Object.entries(value)) {
    if (!ENV_KEY_PATTERN.test(key)) return { error: `Invalid env key: ${key}` };
    if (typeof v !== 'string') return { error: `Env value must be string: ${key}` };
    env[key] = v;
  }
  return { env };
}

/**
 * ローカルLLMタブの Claude Code が名乗るモデル名。tsunagi の中継口が使用中のモデルに書き換えるため、
 * タブを作った後にモデルを切り替えても既存タブがそのまま追従する。
 */
export const LOCAL_MODEL_ALIAS = 'tsunagi-local';

/**
 * ローカルLLMタブの Claude Code を tsunagi の中継口に向けるための環境変数。
 * DB の環境変数より後に適用し、同名キーを上書きする。
 */
export function buildLocalLlmEnv(params: {
  proxyUrl: string;
  contextTokens: number;
  extraEnv: Record<string, string>;
}): Record<string, string> {
  const { proxyUrl, contextTokens, extraEnv } = params;
  return {
    ANTHROPIC_BASE_URL: proxyUrl,
    // 中継口は値を検証しないが、未設定だと Claude Code がログインを要求する
    ANTHROPIC_AUTH_TOKEN: 'tsunagi',
    ANTHROPIC_MODEL: LOCAL_MODEL_ALIAS,
    // opus / sonnet / haiku 等の別名はあえて割り当てない。中継口がどのモデル名でも使用中のモデルに
    // 書き換えるため不要で、割り当てると `/model sonnet` が同じモデルへの切り替えとみなされ、
    // PreModelSwitch フックを通らずに ~/.claude/settings.json へ保存されてしまう
    CLAUDE_CODE_SUBAGENT_MODEL: LOCAL_MODEL_ALIAS,
    // 未知のモデルは 200k 扱いになり auto-compact が効かないため、ローカル側の値に揃える
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(contextTokens),
    // リクエスト毎に変わる attribution がローカル側の KV キャッシュを無効化するため外す
    CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    // ローカルLLMはプロンプト読み込み中(数分)にバイトを返さないため、既定の 5 分の
    // 無通信タイムアウト / stream watchdog で打ち切られ再送される。上限(30分)まで延ばす
    API_FORCE_IDLE_TIMEOUT: '0',
    CLAUDE_STREAM_IDLE_TIMEOUT_MS: '1800000',
    API_TIMEOUT_MS: '3600000',
    ...extraEnv,
  };
}
