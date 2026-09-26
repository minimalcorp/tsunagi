import type {
  LocalLlmModel,
  LocalLlmModelRef,
  LocalLlmSettings,
  LocalLlmStatus,
} from '@minimalcorp/tsunagi-shared';
import { prisma } from './db.js';
import {
  parseContextTokens,
  parseExtraEnv,
  readAppSetting,
  writeAppSetting,
} from './local-llm-env.js';
import {
  OLLAMA_SETTING_KEY,
  ensureOllamaContextModel,
  getOllamaSettings,
  getOllamaStatus,
  listOllamaModels,
  loadOllamaModel,
  ollamaContextModelName,
  unloadOllamaModel,
} from './ollama-settings.js';
import {
  LMSTUDIO_SETTING_KEY,
  getLmStudioSettings,
  getLmStudioStatus,
  listLmStudioModels,
  lmStudioAuthToken,
  loadLmStudioModel,
  unloadLmStudioModel,
} from './lmstudio.js';

/**
 * ローカルLLM（Ollama / LM Studio）の「使用中のモデル」を管理する。
 * 一般的なマシンでは 20〜30GB 級のモデルを2つ同時に載せられないため、メモリに載せるモデルは
 * プロバイダーをまたいで常に1つにする。ローカルLLMタブのリクエストは tsunagi の中継口を通り、
 * ここで使用中のモデルを読み込んで（他は全部解放して）から転送される。
 */

const SETTING_KEY = 'local-llm';

export function defaultLocalLlmSettings(): LocalLlmSettings {
  return {
    active: null,
    idleUnloadMinutes: 15,
    unloadOnExit: true,
    webSearch: 'local',
    extraEnv: {},
  };
}

/**
 * 旧形式（Ollama / LM Studio の設定ごとにモデルを持っていた）からの移行。
 * local-llm の設定がまだなく、旧 Ollama 設定にモデルがあればそれを使用中のモデルにする。
 */
async function migrateLegacySettings(): Promise<LocalLlmSettings> {
  const settings = defaultLocalLlmSettings();
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [OLLAMA_SETTING_KEY, LMSTUDIO_SETTING_KEY] } },
  });
  for (const row of rows) {
    let legacy: Record<string, unknown>;
    try {
      legacy = JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (settings.active || legacy.enabled !== true || typeof legacy.model !== 'string') continue;
    if (!legacy.model) continue;
    settings.active = {
      provider: row.key === OLLAMA_SETTING_KEY ? 'ollama' : 'lmstudio',
      model: legacy.model,
      contextTokens: parseContextTokens(legacy.contextTokens) ?? 65536,
    };
    const extraEnv = parseExtraEnv(legacy.extraEnv);
    if ('env' in extraEnv) settings.extraEnv = extraEnv.env;
    if (legacy.webSearch === 'ollama') settings.webSearch = 'ollama';
  }
  return settings;
}

export async function getLocalLlmSettings(): Promise<LocalLlmSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return migrateLegacySettings();
  return readAppSetting(SETTING_KEY, defaultLocalLlmSettings());
}

export async function saveLocalLlmSettings(settings: LocalLlmSettings): Promise<LocalLlmSettings> {
  return writeAppSetting(SETTING_KEY, settings);
}

/** リクエストボディを検証して LocalLlmSettings に正規化する。不正ならエラーメッセージを返す */
export function parseLocalLlmSettings(
  body: unknown
): { settings: LocalLlmSettings } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Invalid body' };
  const b = body as Record<string, unknown>;

  let active: LocalLlmModelRef | null = null;
  if (b.active !== null && b.active !== undefined) {
    const a = b.active as Record<string, unknown>;
    if (a.provider !== 'ollama' && a.provider !== 'lmstudio') {
      return { error: 'active.provider must be "ollama" or "lmstudio"' };
    }
    if (typeof a.model !== 'string' || !a.model.trim()) {
      return { error: 'active.model must be a non-empty string' };
    }
    const contextTokens = parseContextTokens(a.contextTokens);
    if (!contextTokens) return { error: 'active.contextTokens must be a positive integer' };
    active = { provider: a.provider, model: a.model.trim(), contextTokens };
  }

  const idleUnloadMinutes = Number(b.idleUnloadMinutes);
  if (!Number.isInteger(idleUnloadMinutes) || idleUnloadMinutes < 0) {
    return { error: 'idleUnloadMinutes must be a non-negative integer' };
  }
  if (typeof b.unloadOnExit !== 'boolean') return { error: 'unloadOnExit must be boolean' };
  if (b.webSearch !== 'local' && b.webSearch !== 'ollama') {
    return { error: 'webSearch must be "local" or "ollama"' };
  }
  const extraEnv = parseExtraEnv(b.extraEnv);
  if ('error' in extraEnv) return extraEnv;

  return {
    settings: {
      active,
      idleUnloadMinutes,
      unloadOnExit: b.unloadOnExit,
      webSearch: b.webSearch,
      extraEnv: extraEnv.env,
    },
  };
}

/** ローカルLLMタブを起動できる状態か（オンボーディング完了判定にも使う） */
export async function isLocalLlmReady(): Promise<boolean> {
  const { active } = await getLocalLlmSettings();
  if (!active) return false;
  const provider =
    active.provider === 'ollama' ? await getOllamaSettings() : await getLmStudioSettings();
  return provider.enabled;
}

/** 有効なプロバイダーのダウンロード済みモデル。取得に失敗したプロバイダーはエラーとして返す */
export async function listLocalLlmModels(): Promise<{
  models: LocalLlmModel[];
  errors: Array<{ provider: LocalLlmModelRef['provider']; message: string }>;
}> {
  const [ollama, lmstudio] = await Promise.all([getOllamaSettings(), getLmStudioSettings()]);
  const models: LocalLlmModel[] = [];
  const errors: Array<{ provider: LocalLlmModelRef['provider']; message: string }> = [];
  const tasks: Array<Promise<void>> = [];
  if (ollama.enabled) {
    tasks.push(
      listOllamaModels(ollama.baseUrl)
        .then((list) => void models.push(...list))
        .catch((e: unknown) => void errors.push({ provider: 'ollama', message: errorMessage(e) }))
    );
  }
  if (lmstudio.enabled) {
    tasks.push(
      listLmStudioModels(lmstudio)
        .then((list) => void models.push(...list))
        .catch((e: unknown) => void errors.push({ provider: 'lmstudio', message: errorMessage(e) }))
    );
  }
  await Promise.all(tasks);
  return { models, errors };
}

/** 中継口の転送先 */
export interface LocalLlmTarget {
  baseUrl: string;
  /** 転送時に付ける認証トークン */
  authToken: string;
  /** リクエストの model に入れる名前（Ollama はコンテキスト長を焼き込んだ派生モデル） */
  runModel: string;
}

// ---- 読み込み・解放（同時に走らないよう直列化する） ----

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => undefined).then(task);
  queue = run;
  return run;
}

let loading = false;
let lastError: string | undefined;
let inflight = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleUnloadAt: Date | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Ollama で使用中のモデルを表す名前（派生モデル）。keep は解放しない */
function ollamaKeepName(active: LocalLlmModelRef | null): string | null {
  return active?.provider === 'ollama'
    ? ollamaContextModelName(active.model, active.contextTokens)
    : null;
}

/**
 * keep 以外のモデルを、有効なすべてのプロバイダーで解放する（keep が null なら全部）。
 * LM Studio の keep は、設定のコンテキスト長以上で読み込まれているインスタンスだけ残す。
 */
async function unloadOthers(keep: LocalLlmModelRef | null): Promise<void> {
  const [ollama, lmstudio] = await Promise.all([getOllamaSettings(), getLmStudioSettings()]);
  if (ollama.enabled) {
    const status = await getOllamaStatus(ollama.baseUrl);
    const keepName = ollamaKeepName(keep);
    for (const loaded of status.loaded) {
      if (loaded.name !== keepName) await unloadOllamaModel(ollama.baseUrl, loaded.name);
    }
  }
  if (lmstudio.enabled) {
    const status = await getLmStudioStatus(lmstudio);
    for (const loaded of status.loaded) {
      const isKeep =
        keep?.provider === 'lmstudio' &&
        loaded.key === keep.model &&
        loaded.contextLength >= keep.contextTokens;
      if (!isKeep) await unloadLmStudioModel(lmstudio, loaded.instanceId);
    }
  }
}

/** 指定したプロバイダーのモデルを全部解放する（プロバイダーを無効化する前に使う） */
export function unloadProvider(provider: LocalLlmModelRef['provider']): Promise<void> {
  return serialize(async () => {
    if (provider === 'ollama') {
      const ollama = await getOllamaSettings();
      const status = await getOllamaStatus(ollama.baseUrl);
      for (const loaded of status.loaded) await unloadOllamaModel(ollama.baseUrl, loaded.name);
    } else {
      const lmstudio = await getLmStudioSettings();
      const status = await getLmStudioStatus(lmstudio);
      for (const loaded of status.loaded) {
        await unloadLmStudioModel(lmstudio, loaded.instanceId);
      }
    }
  });
}

/** 使用中のモデルがメモリにあるか（読み込み済みなら転送先を返す） */
async function findLoadedTarget(active: LocalLlmModelRef): Promise<boolean> {
  if (active.provider === 'ollama') {
    const ollama = await getOllamaSettings();
    const status = await getOllamaStatus(ollama.baseUrl);
    return status.loaded.some((l) => l.name === ollamaKeepName(active));
  }
  const lmstudio = await getLmStudioSettings();
  const status = await getLmStudioStatus(lmstudio);
  return status.loaded.some(
    (l) => l.key === active.model && l.contextLength >= active.contextTokens
  );
}

/**
 * 使用中のモデルを読み込み（他のモデルは全部解放し）、中継口の転送先を返す。
 * 読み込み済みなら何もしない。設定の不備はそのまま例外にする（タブにエラーとして表示される）。
 */
export function ensureActiveLoaded(): Promise<LocalLlmTarget> {
  return serialize(async () => {
    const { active } = await getLocalLlmSettings();
    if (!active) {
      throw new Error('ローカルLLMのモデルが未設定です。Settings で使用するモデルを選んでください');
    }
    loading = true;
    try {
      const target = await loadActive(active);
      lastError = undefined;
      return target;
    } catch (error) {
      lastError = errorMessage(error);
      throw error;
    } finally {
      loading = false;
    }
  });
}

async function loadActive(active: LocalLlmModelRef): Promise<LocalLlmTarget> {
  if (active.provider === 'ollama') {
    const ollama = await getOllamaSettings();
    if (!ollama.enabled) throw new Error('Ollama が無効です。Settings で有効にしてください');
    const runModel = await ensureOllamaContextModel(
      ollama.baseUrl,
      active.model,
      active.contextTokens
    );
    await unloadOthers(active);
    if (!(await findLoadedTarget(active))) await loadOllamaModel(ollama.baseUrl, runModel);
    return { baseUrl: ollama.baseUrl, authToken: 'ollama', runModel };
  }

  const lmstudio = await getLmStudioSettings();
  if (!lmstudio.enabled) throw new Error('LM Studio が無効です。Settings で有効にしてください');
  const status = await getLmStudioStatus(lmstudio);
  if (!status.serverRunning) {
    throw new Error(
      'LM Studio のサーバーが起動していません。Settings（LM Studio）か LM Studio アプリの Developer タブから起動してください'
    );
  }
  await unloadOthers(active);
  if (!(await findLoadedTarget(active))) {
    // MLX はモデルの最大値で読み込まれる（KV キャッシュが動的なため）
    await loadLmStudioModel(lmstudio, active.model, active.contextTokens);
  }
  return {
    baseUrl: lmstudio.baseUrl,
    authToken: lmStudioAuthToken(lmstudio),
    runModel: active.model,
  };
}

/** すべてのモデルを解放する（Settings の解放ボタン・自動解放・tsunagi 終了時） */
export function unloadAll(): Promise<void> {
  // 解放済みになるので、予約済みの自動解放は不要になる
  clearIdleTimer();
  return serialize(async () => {
    await unloadOthers(null);
  });
}

// ---- 中継口のリクエスト数と自動解放 ----

function clearIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  idleUnloadAt = null;
}

async function scheduleIdleUnload(): Promise<void> {
  clearIdleTimer();
  const { idleUnloadMinutes } = await getLocalLlmSettings();
  // 待っている間に次のリクエストが始まっていれば予約しない
  if (idleUnloadMinutes === 0 || inflight > 0) return;
  const ms = idleUnloadMinutes * 60 * 1000;
  idleUnloadAt = new Date(Date.now() + ms);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    idleUnloadAt = null;
    if (inflight > 0) return;
    unloadAll().catch((error: unknown) => {
      lastError = `自動解放に失敗しました: ${errorMessage(error)}`;
    });
  }, ms);
}

/** 中継口がリクエストを受け付けたとき */
export function beginRequest(): void {
  inflight += 1;
  clearIdleTimer();
}

/** 中継口のリクエストが終わったとき（成功・失敗・中断のいずれも） */
export function endRequest(): void {
  inflight = Math.max(0, inflight - 1);
  if (inflight === 0) void scheduleIdleUnload();
}

export function getInflight(): number {
  return inflight;
}

export async function getLocalLlmStatus(): Promise<LocalLlmStatus> {
  const { active } = await getLocalLlmSettings();
  const base = {
    active,
    inflight,
    idleUnloadAt: idleUnloadAt ? idleUnloadAt.toISOString() : null,
  };
  if (!active) return { ...base, state: 'unconfigured' };
  if (loading) return { ...base, state: 'loading' };
  try {
    if (await findLoadedTarget(active)) return { ...base, state: 'loaded' };
  } catch (error) {
    return { ...base, state: 'error', error: errorMessage(error) };
  }
  return lastError ? { ...base, state: 'error', error: lastError } : { ...base, state: 'unloaded' };
}

/**
 * 使用中のモデルを切り替える。応答生成中のタブがあれば切り替えない（生成中のモデルを外すと壊れるため）。
 * 読み込みは待たずに始める（状態は getLocalLlmStatus で確認する）。
 */
export async function activate(
  next: LocalLlmSettings
): Promise<{ ok: true; settings: LocalLlmSettings } | { ok: false; error: string }> {
  const current = await getLocalLlmSettings();
  const changed = JSON.stringify(current.active) !== JSON.stringify(next.active);
  if (changed && inflight > 0) {
    return {
      ok: false,
      error:
        '応答を生成中のタブがあるため、モデルを切り替えられません。完了してから切り替えてください',
    };
  }
  const settings = await saveLocalLlmSettings(next);
  if (changed) {
    lastError = undefined;
    if (settings.active) {
      ensureActiveLoaded().catch(() => undefined);
    } else {
      unloadAll().catch(() => undefined);
    }
  }
  // 自動解放の時間が変わった場合に予約し直す
  if (inflight === 0 && idleTimer) void scheduleIdleUnload();
  return { ok: true, settings };
}

/** tsunagi 終了時（設定で有効なら）にモデルを解放する。終了を妨げないよう上限時間を設ける */
export async function unloadOnShutdown(timeoutMs = 10000): Promise<void> {
  clearIdleTimer();
  const { unloadOnExit } = await getLocalLlmSettings().catch(() => defaultLocalLlmSettings());
  if (!unloadOnExit) return;
  await Promise.race([
    unloadAll().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
