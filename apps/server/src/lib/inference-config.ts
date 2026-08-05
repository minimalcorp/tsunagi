import * as fs from 'node:fs';
import * as path from 'node:path';
import { getStateDir } from './data-path.js';

const CONFIG_FILE = path.join(getStateDir(), 'inference-config.json');

export type InferenceService = 'whisper' | 'llm';
export type InferenceMode = 'local' | 'remote';

export interface InferenceServiceConfig {
  mode: InferenceMode;
  remoteUrl?: string;
}

const DEFAULT_SERVICE_CONFIG: InferenceServiceConfig = { mode: 'local' };

interface InferenceConfigFile {
  whisper?: InferenceServiceConfig;
  llm?: InferenceServiceConfig;
}

// ~/.tsunagi/state/inference-config.json をプロセス起動時に一度だけ読み込み、
// 以降は書き込み時にメモリとファイルの両方を同期する(リクエストの都度ファイルI/Oを
// 発生させないため)。
let cache: InferenceConfigFile | null = null;

function load(): InferenceConfigFile {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    cache = JSON.parse(raw) as InferenceConfigFile;
  } catch {
    cache = {};
  }
  return cache;
}

export function getInferenceServiceConfig(service: InferenceService): InferenceServiceConfig {
  return load()[service] ?? DEFAULT_SERVICE_CONFIG;
}

export function setInferenceServiceConfig(
  service: InferenceService,
  config: InferenceServiceConfig
): void {
  const next = { ...load(), [service]: config };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  cache = next;
}

// POST /whisper(llm)/server/config のリクエストボディを検証する。
// mode=remoteの場合はremoteUrlが有効なURL文字列であることまで確認する。
export function validateInferenceServiceConfigBody(
  body: unknown
): { config: InferenceServiceConfig } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'リクエストボディが不正です' };
  }
  const { mode, remoteUrl } = body as { mode?: unknown; remoteUrl?: unknown };
  if (mode !== 'local' && mode !== 'remote') {
    return { error: 'modeは"local"または"remote"を指定してください' };
  }
  if (mode === 'local') {
    return { config: { mode: 'local' } };
  }
  if (typeof remoteUrl !== 'string' || !remoteUrl.trim()) {
    return { error: 'remoteモードではremoteUrlが必須です' };
  }
  try {
    new URL(remoteUrl);
  } catch {
    return { error: `remoteUrlが不正なURLです: ${remoteUrl}` };
  }
  return { config: { mode: 'remote', remoteUrl: remoteUrl.trim() } };
}

// URL解決の優先順位: ランタイム設定ファイル(リモートモード時) > 環境変数 > デフォルト値。
// リモートモードでもremoteUrl未設定の場合はフォールバックする(設定が壊れていても
// ローカル動作に戻れるようにするため)。
export function resolveServiceUrl(
  service: InferenceService,
  envVarValue: string | undefined,
  defaultUrl: string
): string {
  const config = getInferenceServiceConfig(service);
  if (config.mode === 'remote' && config.remoteUrl) return config.remoteUrl;
  return envVarValue || defaultUrl;
}
