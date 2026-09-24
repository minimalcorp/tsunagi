import type { OllamaSettings } from '@minimalcorp/tsunagi-shared';
import { prisma } from './db.js';

const SETTING_KEY = 'ollama';

const DEFAULT_CONTEXT_TOKENS = 65536;

// Docker 内から host の Ollama に繋ぐ場合は compose で host.docker.internal を指定する
const DEFAULT_BASE_URL = process.env.TSUNAGI_OLLAMA_URL || 'http://localhost:11434';

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Ollama タブでは Anthropic の認証情報を環境変数ごと取り除く（ANTHROPIC_AUTH_TOKEN と競合するため） */
export const OLLAMA_UNSET_ENV_KEYS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

export function defaultOllamaSettings(): OllamaSettings {
  return {
    enabled: false,
    baseUrl: DEFAULT_BASE_URL,
    model: '',
    contextTokens: DEFAULT_CONTEXT_TOKENS,
    extraEnv: {},
  };
}

export async function getOllamaSettings(): Promise<OllamaSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return defaultOllamaSettings();
  try {
    return { ...defaultOllamaSettings(), ...(JSON.parse(row.value) as Partial<OllamaSettings>) };
  } catch {
    return defaultOllamaSettings();
  }
}

export async function saveOllamaSettings(settings: OllamaSettings): Promise<OllamaSettings> {
  const value = JSON.stringify(settings);
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  });
  return settings;
}

/** リクエストボディを検証して OllamaSettings に正規化する。不正ならエラーメッセージを返す */
export function parseOllamaSettings(
  body: unknown
): { settings: OllamaSettings } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;

  if (typeof b.enabled !== 'boolean') return { error: 'enabled must be boolean' };

  const baseUrl = typeof b.baseUrl === 'string' ? b.baseUrl.trim().replace(/\/+$/, '') : '';
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    return { error: 'baseUrl must be a valid http(s) URL' };
  }

  if (typeof b.model !== 'string') return { error: 'model must be string' };

  const contextTokens = Number(b.contextTokens);
  if (!Number.isInteger(contextTokens) || contextTokens <= 0) {
    return { error: 'contextTokens must be a positive integer' };
  }

  const extraEnv: Record<string, string> = {};
  if (b.extraEnv !== undefined) {
    if (typeof b.extraEnv !== 'object' || b.extraEnv === null || Array.isArray(b.extraEnv)) {
      return { error: 'extraEnv must be an object' };
    }
    for (const [key, value] of Object.entries(b.extraEnv)) {
      if (!ENV_KEY_PATTERN.test(key)) return { error: `Invalid env key: ${key}` };
      if (typeof value !== 'string') return { error: `Env value must be string: ${key}` };
      extraEnv[key] = value;
    }
  }

  return {
    settings: { enabled: b.enabled, baseUrl, model: b.model.trim(), contextTokens, extraEnv },
  };
}

/** Ollama タブを起動できる状態か（オンボーディング完了判定にも使う） */
export function isOllamaReady(settings: OllamaSettings): boolean {
  return settings.enabled && settings.model !== '';
}

/**
 * Ollama の Anthropic 互換 API で Claude Code を動かすための環境変数。
 * DB の環境変数より後に適用し、同名キーを上書きする。
 */
export function buildOllamaEnv(settings: OllamaSettings): Record<string, string> {
  const { baseUrl, model, contextTokens, extraEnv } = settings;
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    // Ollama は値を検証しないが、未設定だと Claude Code がログインを要求する
    ANTHROPIC_AUTH_TOKEN: 'ollama',
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    // 未知のモデルは 200k 扱いになり auto-compact が効かないため、Ollama 側の値に揃える
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

/** Ollama に pull 済みのモデル名一覧を取得する */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const json = (await res.json()) as { models?: Array<{ name: string }> };
  return (json.models ?? []).map((m) => m.name).sort();
}
