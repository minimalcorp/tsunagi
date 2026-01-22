import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { EnvironmentVariable } from './types';

const ENV_FILE = path.join(os.homedir(), '.tsunagi', 'state', 'env.json');

// Queue機構（レースコンディション対策）
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
      this.process();
    });
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) await task();
    }

    this.running = false;
  }
}

const queue = new Queue();

// ファイルの原子的な読み込み
async function readEnvVars(): Promise<EnvironmentVariable[]> {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// ファイルの原子的な書き込み
async function writeEnvVars(envVars: EnvironmentVariable[]): Promise<void> {
  const dir = path.dirname(ENV_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = `${ENV_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(envVars, null, 2), 'utf-8');
  await fs.rename(tmpFile, ENV_FILE);
}

// 環境変数取得（優先順位: repo > owner > global）
export async function getEnv(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<Record<string, string>> {
  return queue.add(async () => {
    const envVars = await readEnvVars();
    const result: Record<string, string> = {};

    // グローバル変数を先に適用
    envVars
      .filter((env) => env.scope === 'global')
      .forEach((env) => {
        result[env.key] = env.value;
      });

    // owner変数を適用（上書き）
    if (scope === 'owner' || scope === 'repo') {
      envVars
        .filter((env) => env.scope === 'owner' && env.owner === owner)
        .forEach((env) => {
          result[env.key] = env.value;
        });
    }

    // repo変数を適用（上書き）
    if (scope === 'repo') {
      envVars
        .filter((env) => env.scope === 'repo' && env.owner === owner && env.repo === repo)
        .forEach((env) => {
          result[env.key] = env.value;
        });
    }

    return result;
  });
}

// 環境変数設定
export async function setEnv(
  key: string,
  value: string,
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<void> {
  return queue.add(async () => {
    const envVars = await readEnvVars();

    // 既存の変数を削除
    const filtered = envVars.filter((env) => {
      if (env.key !== key) return true;
      if (env.scope !== scope) return true;
      if (scope === 'owner' && env.owner !== owner) return true;
      if (scope === 'repo' && (env.owner !== owner || env.repo !== repo)) return true;
      return false;
    });

    // 新しい変数を追加
    const newEnvVar: EnvironmentVariable = {
      key,
      value,
      scope,
      owner,
      repo,
    };
    filtered.push(newEnvVar);

    await writeEnvVars(filtered);
  });
}

// 環境変数削除
export async function deleteEnv(
  key: string,
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<boolean> {
  return queue.add(async () => {
    const envVars = await readEnvVars();
    const initialLength = envVars.length;

    const filtered = envVars.filter((env) => {
      if (env.key !== key) return true;
      if (env.scope !== scope) return true;
      if (scope === 'owner' && env.owner !== owner) return true;
      if (scope === 'repo' && (env.owner !== owner || env.repo !== repo)) return true;
      return false;
    });

    if (filtered.length === initialLength) return false;

    await writeEnvVars(filtered);
    return true;
  });
}
