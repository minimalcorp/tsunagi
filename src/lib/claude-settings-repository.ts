import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ClaudeSettingSources, SettingSource, ResolvedSettings } from './types';
import * as envRepo from './env-repository';

// 保存先: ~/.tsunagi/state/claude-settings.json
const SETTINGS_FILE = path.join(os.homedir(), '.tsunagi', 'state', 'claude-settings.json');

// キュー機構（env-repository.tsと同様）
class Queue {
  private queue: (() => Promise<void>)[] = [];
  private running = false;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.run();
    });
  }

  private async run() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) await fn();
    }

    this.running = false;
  }
}

const queue = new Queue();

// 読み込み処理
async function readSettings(): Promise<ClaudeSettingSources[]> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data) as ClaudeSettingSources[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// 書き込み処理（原子的）
async function writeSettings(settings: ClaudeSettingSources[]): Promise<void> {
  const dir = path.dirname(SETTINGS_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = `${SETTINGS_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(settings, null, 2), 'utf-8');
  await fs.rename(tmpFile, SETTINGS_FILE);
}

/**
 * 設定の取得（優先順位: repo > owner > global）
 */
export async function getSettingSources(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<SettingSource[] | undefined> {
  return queue.add(async () => {
    const allSettings = await readSettings();
    let result: ClaudeSettingSources | undefined;

    // repo スコープの設定を優先
    if (scope === 'repo' && owner && repo) {
      result = allSettings.find(
        (s) => s.scope === 'repo' && s.owner === owner && s.repo === repo && s.enabled
      );
    }

    // owner スコープの設定を次に優先
    if (!result && (scope === 'owner' || scope === 'repo') && owner) {
      result = allSettings.find((s) => s.scope === 'owner' && s.owner === owner && s.enabled);
    }

    // global スコープの設定を最後に使用
    if (!result) {
      result = allSettings.find((s) => s.scope === 'global' && s.enabled);
    }

    // 設定が見つからない、またはsourcesが空の場合はundefined（isolationモード）
    return result && result.sources.length > 0 ? result.sources : undefined;
  });
}

/**
 * 設定の保存
 */
export async function setSettingSources(
  scope: 'global' | 'owner' | 'repo',
  sources: SettingSource[],
  owner?: string,
  repo?: string
): Promise<void> {
  return queue.add(async () => {
    const allSettings = await readSettings();

    const newSetting: ClaudeSettingSources = {
      scope,
      owner,
      repo,
      sources,
      enabled: true,
    };

    // 既存の設定を検索
    const existingIndex = allSettings.findIndex((s) => {
      if (s.scope === 'global') return scope === 'global';
      if (s.scope === 'owner') return scope === 'owner' && s.owner === owner;
      if (s.scope === 'repo') return scope === 'repo' && s.owner === owner && s.repo === repo;
      return false;
    });

    if (existingIndex >= 0) {
      allSettings[existingIndex] = newSetting;
    } else {
      allSettings.push(newSetting);
    }

    await writeSettings(allSettings);
  });
}

/**
 * 設定の削除
 */
export async function deleteSettingSources(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<void> {
  return queue.add(async () => {
    let allSettings = await readSettings();

    allSettings = allSettings.filter((s) => {
      if (scope === 'global') return s.scope !== 'global';
      if (scope === 'owner') return !(s.scope === 'owner' && s.owner === owner);
      if (scope === 'repo') return !(s.scope === 'repo' && s.owner === owner && s.repo === repo);
      return true;
    });

    await writeSettings(allSettings);
  });
}

/**
 * 設定の有効/無効切り替え
 */
export async function toggleSettingSources(
  scope: 'global' | 'owner' | 'repo',
  enabled: boolean,
  owner?: string,
  repo?: string
): Promise<void> {
  return queue.add(async () => {
    const allSettings = await readSettings();

    const setting = allSettings.find((s) => {
      if (scope === 'global') return s.scope === 'global';
      if (scope === 'owner') return s.scope === 'owner' && s.owner === owner;
      if (scope === 'repo') return s.scope === 'repo' && s.owner === owner && s.repo === repo;
      return false;
    });

    if (setting) {
      setting.enabled = enabled;
      await writeSettings(allSettings);
    }
  });
}

/**
 * resolveSettings: プロジェクト固有の設定を解決（環境変数も含む）
 */
export async function resolveSettings(params: {
  owner: string;
  repo: string;
}): Promise<ResolvedSettings> {
  const { owner, repo } = params;

  // settingSourcesを取得
  const settingSources = await getSettingSources('repo', owner, repo);

  // 環境変数を取得（Claude Tokenを含む）
  const env = await envRepo.getEnv('repo', owner, repo);

  return {
    settingSources,
    env,
  };
}
