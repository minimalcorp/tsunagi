import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentAuthStatus, AgentProfile } from '@minimalcorp/tsunagi-shared';
import { prisma } from './db.js';
import { getTsunagiDataDir } from './data-path.js';
import { AGENTS, type AgentAdapter } from './agents/index.js';

/**
 * エージェントのプロファイル（Claude: CLAUDE_CONFIG_DIR / Codex: CODEX_HOME）。
 * タブで使うプロファイルの割り当ては予約キー（adapter.profile.envKey）に slug か DEFAULT_PROFILE を保存し、
 * 環境変数と同じ global → owner → repo の継承で解決して PTY 起動時に設定ディレクトリへ変換する
 * （resolveAgentProfileEnv）。
 */

/** システム既定（設定ディレクトリの環境変数を付けず ~/.claude / ~/.codex を使う） */
export const DEFAULT_PROFILE = 'default';

/** 汎用の環境変数として登録させないキー（認証はプロファイルで扱う） */
export const RESERVED_ENV_KEYS = AGENTS.flatMap(({ profile }) => [
  profile.envKey,
  profile.configDirEnvKey,
  ...profile.authEnvKeys,
]);

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export function getProfilesDir(agent: AgentAdapter): string {
  return path.join(getTsunagiDataDir(), `${agent.id}-profiles`);
}

/** プロファイルの設定ディレクトリ。システム既定は undefined */
export function getProfileConfigDir(agent: AgentAdapter, slug: string): string | undefined {
  if (slug === DEFAULT_PROFILE) return undefined;
  return path.join(getProfilesDir(agent), slug);
}

/** 空白を `-` にし、小文字にする（macOS のファイルシステムは大文字小文字を区別しないため） */
export function toProfileSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}

/** プロファイル名の検証。問題があればエラーメッセージを返す */
export function validateProfileName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (!PROFILE_NAME_PATTERN.test(trimmed)) {
    return 'Use only letters, numbers, spaces, "-" and "_"';
  }
  if (toProfileSlug(trimmed) === DEFAULT_PROFILE) {
    return `"${DEFAULT_PROFILE}" is reserved`;
  }
  return null;
}

export async function listProfiles(agent: AgentAdapter): Promise<AgentProfile[]> {
  const rows = await prisma.agentProfile.findMany({
    where: { agent: agent.id },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({
    agent: agent.id,
    slug: row.slug,
    name: row.name,
    configDir: path.join(getProfilesDir(agent), row.slug),
  }));
}

export async function profileExists(agent: AgentAdapter, slug: string): Promise<boolean> {
  if (slug === DEFAULT_PROFILE) return true;
  return (await prisma.agentProfile.count({ where: { agent: agent.id, slug } })) > 0;
}

export async function createProfile(agent: AgentAdapter, name: string): Promise<AgentProfile> {
  const error = validateProfileName(name);
  if (error) throw new Error(error);
  const trimmed = name.trim();
  const slug = toProfileSlug(trimmed);
  if (await profileExists(agent, slug)) {
    throw new Error(`Profile "${slug}" already exists`);
  }
  const configDir = path.join(getProfilesDir(agent), slug);
  await fs.mkdir(configDir, { recursive: true });
  await prisma.agentProfile.create({ data: { agent: agent.id, slug, name: trimmed } });
  return { agent: agent.id, slug, name: trimmed, configDir };
}

/**
 * プロファイルを削除する。ログイン情報（macOS の Keychain 等）を残さないよう先に logout し、
 * このプロファイルを割り当てていたスコープは割り当てを外して親の設定を継承させる。
 */
export async function deleteProfile(agent: AgentAdapter, slug: string): Promise<void> {
  const configDir = getProfileConfigDir(agent, slug);
  if (!configDir) throw new Error('The system default profile cannot be deleted');
  await agent.profile.logout(configDir).catch(() => undefined);
  await prisma.environmentVariable.deleteMany({
    where: { key: agent.profile.envKey, value: slug },
  });
  await prisma.agentProfile.delete({ where: { agent_slug: { agent: agent.id, slug } } });
  await fs.rm(configDir, { recursive: true, force: true });
}

export function getProfileAuthStatus(agent: AgentAdapter, slug: string): Promise<AgentAuthStatus> {
  return agent.profile.getAuthStatus(getProfileConfigDir(agent, slug));
}

/** ログイン用 PTY の環境変数（PtyManager.createSession の env / unsetKeys） */
export function loginPtyEnv(
  agent: AgentAdapter,
  slug: string
): { env: Record<string, string>; unsetKeys: string[] } {
  const configDir = getProfileConfigDir(agent, slug);
  if (!configDir) return { env: {}, unsetKeys: [] };
  return {
    env: { [agent.profile.configDirEnvKey]: configDir },
    unsetKeys: agent.profile.authEnvKeys,
  };
}

/**
 * 継承解決済みの環境変数に含まれる各エージェントのプロファイル割り当てを設定ディレクトリに変換する。
 * 予約キー自体は PTY に渡さない。
 */
export function resolveAgentProfileEnv(env: Record<string, string>): {
  env: Record<string, string>;
  unsetKeys: string[];
} {
  const rest = { ...env };
  const unsetKeys: string[] = [];
  for (const agent of AGENTS) {
    const { envKey, configDirEnvKey, authEnvKeys } = agent.profile;
    const slug = rest[envKey];
    delete rest[envKey];
    const configDir = slug ? getProfileConfigDir(agent, slug) : undefined;
    // システム既定: 外側 Terminal の環境のまま（普段ターミナルで CLI を使うときと同じ）
    if (!configDir) continue;
    rest[configDirEnvKey] = configDir;
    unsetKeys.push(...authEnvKeys);
  }
  return { env: rest, unsetKeys };
}
