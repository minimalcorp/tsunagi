import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  LmStudioEstimate,
  LmStudioSettings,
  LmStudioStatus,
  LocalLlmModel,
} from '@minimalcorp/tsunagi-shared';
import { normalizeBaseUrl, readAppSetting, writeAppSetting } from './local-llm-env.js';

export const LMSTUDIO_SETTING_KEY = 'lmstudio';

const DEFAULT_BASE_URL = process.env.TSUNAGI_LMSTUDIO_URL || 'http://localhost:1234';

/** LM Studio の初回起動時に置かれる lms CLI */
const DEFAULT_LMS_PATH = path.join(os.homedir(), '.lmstudio', 'bin', 'lms');

// モデルの読み込みは 20GB 級で数十秒かかる
const LOAD_TIMEOUT_MS = 10 * 60 * 1000;

export function defaultLmStudioSettings(): LmStudioSettings {
  return { enabled: false, baseUrl: DEFAULT_BASE_URL, apiToken: '', lmsPath: '' };
}

export async function getLmStudioSettings(): Promise<LmStudioSettings> {
  const { enabled, baseUrl, apiToken, lmsPath } = await readAppSetting(
    LMSTUDIO_SETTING_KEY,
    defaultLmStudioSettings()
  );
  return { enabled, baseUrl, apiToken, lmsPath };
}

export async function saveLmStudioSettings(settings: LmStudioSettings): Promise<LmStudioSettings> {
  return writeAppSetting(LMSTUDIO_SETTING_KEY, settings);
}

/** リクエストボディを検証して LmStudioSettings に正規化する。不正ならエラーメッセージを返す */
export function parseLmStudioSettings(
  body: unknown
): { settings: LmStudioSettings } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;

  if (typeof b.enabled !== 'boolean') return { error: 'enabled must be boolean' };

  const baseUrl = normalizeBaseUrl(b.baseUrl);
  if (!baseUrl) return { error: 'baseUrl must be a valid http(s) URL' };

  for (const key of ['apiToken', 'lmsPath'] as const) {
    if (typeof b[key] !== 'string') return { error: `${key} must be string` };
  }

  return {
    settings: {
      enabled: b.enabled,
      baseUrl,
      apiToken: (b.apiToken as string).trim(),
      lmsPath: (b.lmsPath as string).trim(),
    },
  };
}

/** LM Studio へのリクエストに付ける認証トークン（認証を有効にしていなければ値は検証されない） */
export function lmStudioAuthToken(settings: LmStudioSettings): string {
  return settings.apiToken || 'lmstudio';
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** lms CLI を探す（設定値 → ~/.lmstudio/bin/lms → PATH）。見つからなければ null */
export function findLms(settings: LmStudioSettings): string | null {
  if (settings.lmsPath) return isExecutable(settings.lmsPath) ? settings.lmsPath : null;
  if (isExecutable(DEFAULT_LMS_PATH)) return DEFAULT_LMS_PATH;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'lms');
    if (dir && isExecutable(candidate)) return candidate;
  }
  return null;
}

function runLms(
  settings: LmStudioSettings,
  args: string[],
  timeout = 60000
): Promise<{ stdout: string; stderr: string }> {
  const lms = findLms(settings);
  if (!lms) {
    return Promise.reject(
      new Error(
        'lms CLI が見つかりません。LM Studio を一度起動するか、lms のパスを設定してください'
      )
    );
  }
  return new Promise((resolve, reject) => {
    execFile(lms, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`lms ${args.join(' ')} failed: ${stderr.trim() || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function authHeaders(settings: LmStudioSettings): Record<string, string> {
  return settings.apiToken ? { Authorization: `Bearer ${settings.apiToken}` } : {};
}

interface RestModel {
  type: string;
  key: string;
  display_name?: string;
  format?: string | null;
  size_bytes?: number;
  params_string?: string | null;
  max_context_length?: number;
  loaded_instances?: Array<{ id: string; config?: { context_length?: number } }>;
}

async function fetchRestModels(settings: LmStudioSettings, timeout = 3000): Promise<RestModel[]> {
  const res = await fetch(`${settings.baseUrl}/api/v1/models`, {
    headers: authHeaders(settings),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`LM Studio responded ${res.status}`);
  return ((await res.json()) as { models?: RestModel[] }).models ?? [];
}

export async function getLmStudioStatus(settings: LmStudioSettings): Promise<LmStudioStatus> {
  const lmsPath = findLms(settings);
  try {
    const models = await fetchRestModels(settings);
    return {
      lmsPath,
      serverRunning: true,
      loaded: models.flatMap((m) =>
        (m.loaded_instances ?? []).map((i) => ({
          key: m.key,
          instanceId: i.id,
          contextLength: i.config?.context_length ?? 0,
        }))
      ),
    };
  } catch (error) {
    return {
      lmsPath,
      serverRunning: false,
      loaded: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** ダウンロード済みの LLM 一覧。サーバー停止中でも選べるよう lms ls にフォールバックする */
export async function listLmStudioModels(settings: LmStudioSettings): Promise<LocalLlmModel[]> {
  let models: LocalLlmModel[];
  try {
    models = (await fetchRestModels(settings))
      .filter((m) => m.type === 'llm')
      .map((m) => ({
        provider: 'lmstudio' as const,
        model: m.key,
        displayName: m.display_name ?? m.key,
        format: m.format ?? '',
        sizeBytes: m.size_bytes ?? 0,
        maxContextLength: m.max_context_length ?? null,
      }));
  } catch {
    const { stdout } = await runLms(settings, ['ls', '--json', '--llm']);
    const list = JSON.parse(stdout) as Array<{
      modelKey: string;
      displayName?: string;
      format?: string;
      sizeBytes?: number;
      maxContextLength?: number;
    }>;
    models = list.map((m) => ({
      provider: 'lmstudio' as const,
      model: m.modelKey,
      displayName: m.displayName ?? m.modelKey,
      // lms ls は MLX を safetensors と表記する
      format: m.format === 'safetensors' ? 'mlx' : (m.format ?? ''),
      sizeBytes: m.sizeBytes ?? 0,
      maxContextLength: m.maxContextLength ?? null,
    }));
  }
  return models.sort((a, b) => a.model.localeCompare(b.model));
}

function portOf(baseUrl: string): string {
  const url = new URL(baseUrl);
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

export async function startLmStudioServer(settings: LmStudioSettings): Promise<void> {
  await runLms(settings, ['server', 'start', '--port', portOf(settings.baseUrl)]);
}

export async function stopLmStudioServer(settings: LmStudioSettings): Promise<void> {
  await runLms(settings, ['server', 'stop']);
}

/** 読み込みに必要なメモリの見積もり（lms load --estimate-only の出力を読む） */
export async function estimateLmStudioLoad(
  settings: LmStudioSettings,
  model: string,
  contextTokens: number
): Promise<LmStudioEstimate> {
  const { stdout } = await runLms(settings, [
    'load',
    model,
    '--context-length',
    String(contextTokens),
    '--estimate-only',
    '--yes',
  ]);
  return {
    totalMemory: stdout.match(/Estimated Total Memory:\s*(.+)/)?.[1]?.trim() ?? null,
    verdict: stdout.match(/Estimate:\s*(.+)/)?.[1]?.trim() ?? null,
  };
}

export async function unloadLmStudioModel(
  settings: LmStudioSettings,
  instanceId: string
): Promise<void> {
  const res = await fetch(`${settings.baseUrl}/api/v1/models/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(settings) },
    body: JSON.stringify({ instance_id: instanceId }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`LM Studio の unload に失敗しました (${res.status})`);
}

export async function loadLmStudioModel(
  settings: LmStudioSettings,
  model: string,
  contextTokens: number
): Promise<void> {
  const res = await fetch(`${settings.baseUrl}/api/v1/models/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(settings) },
    body: JSON.stringify({ model, context_length: contextTokens }),
    signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(`LM Studio でモデルを読み込めません: ${message ?? res.status}`);
  }
}
