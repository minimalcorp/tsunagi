import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentAvailability } from '@minimalcorp/tsunagi-shared';
import type { AgentAdapter, AgentProfileSpec } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * エージェント CLI を実行するときの環境変数。プロファイルのログインを見るよう設定ディレクトリを付け、
 * ログインより優先される認証情報の環境変数は取り除く。システム既定は外側 Terminal の環境のまま
 * （普段ターミナルで CLI を使うときと同じ）。
 */
export function agentCliEnv(
  profile: AgentProfileSpec,
  configDir: string | undefined
): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (configDir) {
    env[profile.configDirEnvKey] = configDir;
    for (const key of profile.authEnvKeys) delete env[key];
  }
  return env;
}

export async function runAgentCli(
  cli: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cli, args, { env, timeout: 15_000 });
}

function isAtLeast(version: number[], min: readonly number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    if (version[i] !== min[i]) return version[i] > min[i];
  }
  return true;
}

/** CLI の更新を拾えるよう、短時間だけ結果を使い回す */
const AVAILABILITY_TTL_MS = 30_000;
const availabilityCache = new Map<string, { at: number; value: Promise<AgentAvailability> }>();

async function detectAvailability(adapter: AgentAdapter): Promise<AgentAvailability> {
  const minVersion = adapter.minVersion.join('.');
  try {
    const { stdout } = await runAgentCli(adapter.cli, ['--version'], process.env);
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(stdout);
    const version = match ? match.slice(1).map(Number) : null;
    return {
      agent: adapter.id,
      installed: true,
      version: version?.join('.'),
      supported: version !== null && isAtLeast(version, adapter.minVersion),
      minVersion,
    };
  } catch {
    return { agent: adapter.id, installed: false, supported: false, minVersion };
  }
}

/** `<cli> --version` で導入状況を確認する */
export function getAgentAvailability(adapter: AgentAdapter): Promise<AgentAvailability> {
  const cached = availabilityCache.get(adapter.id);
  if (cached && Date.now() - cached.at < AVAILABILITY_TTL_MS) return cached.value;
  const value = detectAvailability(adapter);
  availabilityCache.set(adapter.id, { at: Date.now(), value });
  return value;
}
