import type {
  LocalLlmModel,
  OllamaAccountStatus,
  OllamaSettings,
  OllamaStatus,
} from '@minimalcorp/tsunagi-shared';
import { normalizeBaseUrl, readAppSetting, writeAppSetting } from './local-llm-env.js';

export const OLLAMA_SETTING_KEY = 'ollama';

// Docker 内から host の Ollama に繋ぐ場合は TSUNAGI_OLLAMA_URL で host.docker.internal を指定する
const DEFAULT_BASE_URL = process.env.TSUNAGI_OLLAMA_URL || 'http://localhost:11434';

/** コンテキスト長を固定した派生モデルの tag に付ける目印 */
const CONTEXT_MODEL_MARKER = '-tsunagi-ctx';

// 20GB 級のモデルの読み込みは数十秒かかる
const LOAD_TIMEOUT_MS = 10 * 60 * 1000;

export function defaultOllamaSettings(): OllamaSettings {
  return { enabled: false, baseUrl: DEFAULT_BASE_URL };
}

export async function getOllamaSettings(): Promise<OllamaSettings> {
  const { enabled, baseUrl } = await readAppSetting(OLLAMA_SETTING_KEY, defaultOllamaSettings());
  return { enabled, baseUrl };
}

export async function saveOllamaSettings(settings: OllamaSettings): Promise<OllamaSettings> {
  return writeAppSetting(OLLAMA_SETTING_KEY, settings);
}

/** リクエストボディを検証して OllamaSettings に正規化する。不正ならエラーメッセージを返す */
export function parseOllamaSettings(
  body: unknown
): { settings: OllamaSettings } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== 'boolean') return { error: 'enabled must be boolean' };
  const baseUrl = normalizeBaseUrl(b.baseUrl);
  if (!baseUrl) return { error: 'baseUrl must be a valid http(s) URL' };
  return { settings: { enabled: b.enabled, baseUrl } };
}

/**
 * コンテキスト長を固定した派生モデルの名前（例: qwen3.6:35b-a3b → qwen3.6:35b-a3b-tsunagi-ctx65536）。
 * Anthropic 互換 API ではリクエスト毎に num_ctx を渡せず、Ollama 全体の既定値（VRAM 24GiB 未満は 4k）
 * が使われるため、num_ctx を焼き込んだモデルを作ってそれを使う。
 */
export function ollamaContextModelName(model: string, contextTokens: number): string {
  const withTag = model.includes(':') ? model : `${model}:latest`;
  return `${withTag}${CONTEXT_MODEL_MARKER}${contextTokens}`;
}

/** 派生モデルがなければ作る（重みは元モデルの blob を共有するため数秒で終わる）。作ったモデル名を返す */
export async function ensureOllamaContextModel(
  baseUrl: string,
  model: string,
  contextTokens: number
): Promise<string> {
  const name = ollamaContextModelName(model, contextTokens);

  const show = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    body: JSON.stringify({ model: name }),
    signal: AbortSignal.timeout(10000),
  });
  if (show.ok) return name;

  const res = await fetch(`${baseUrl}/api/create`, {
    method: 'POST',
    body: JSON.stringify({
      model: name,
      from: model,
      parameters: { num_ctx: contextTokens },
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      `Ollama でコンテキスト長 ${contextTokens} のモデルを作成できません: ${body.error ?? res.status}`
    );
  }
  return name;
}

/** モデルをメモリに読み込む（空のプロンプトで generate すると読み込みだけ行われる） */
export async function loadOllamaModel(baseUrl: string, name: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model: name }),
    signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`Ollama でモデルを読み込めません: ${body.error ?? res.status}`);
  }
}

/** モデルをメモリから外す */
export async function unloadOllamaModel(baseUrl: string, name: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model: name, keep_alive: 0 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Ollama の unload に失敗しました (${res.status})`);
}

/**
 * Ollama の ollama.com サインイン状態を取得する。
 * Claude Code の WebSearch（web_search サーバーツール）は Ollama が ollama.com の Web 検索 API で
 * 代行するが、未サインインだと 401 になり `web_search_tool_result_error: unavailable` が返る。
 */
export async function getOllamaAccount(baseUrl: string): Promise<OllamaAccountStatus> {
  const res = await fetch(`${baseUrl}/api/me`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
  });
  const json = (await res.json().catch(() => ({}))) as { name?: string; signin_url?: string };
  if (res.ok && json.name) return { signedIn: true, name: json.name };
  if (res.status === 401) return { signedIn: false, signinUrl: json.signin_url };
  throw new Error(`Ollama responded ${res.status}`);
}

/** Ollama に pull 済みのモデル一覧を取得する（tsunagi が作った派生モデルは除く） */
export async function listOllamaModels(baseUrl: string): Promise<LocalLlmModel[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const json = (await res.json()) as {
    models?: Array<{
      name: string;
      size?: number;
      details?: { format?: string; parameter_size?: string; quantization_level?: string };
    }>;
  };
  return (json.models ?? [])
    .filter((m) => !m.name.includes(CONTEXT_MODEL_MARKER))
    .map((m) => ({
      provider: 'ollama' as const,
      model: m.name,
      displayName: [m.name, m.details?.quantization_level].filter(Boolean).join(' '),
      // Ollama の MLX モデルは format が safetensors になる
      format: m.details?.format === 'safetensors' ? 'mlx' : (m.details?.format ?? ''),
      sizeBytes: m.size ?? 0,
      maxContextLength: null,
    }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

/** Ollama サーバーの接続可否・バージョン・読み込み中のモデル */
export async function getOllamaStatus(baseUrl: string): Promise<OllamaStatus> {
  try {
    const [versionRes, psRes] = await Promise.all([
      fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(3000) }),
    ]);
    const version = ((await versionRes.json()) as { version?: string }).version;
    const ps = (await psRes.json()) as {
      models?: Array<{ name: string; context_length?: number }>;
    };
    return {
      reachable: true,
      version,
      loaded: (ps.models ?? []).map((m) => ({ name: m.name, contextLength: m.context_length })),
    };
  } catch (error) {
    return {
      reachable: false,
      loaded: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
