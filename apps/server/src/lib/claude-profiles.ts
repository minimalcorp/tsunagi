import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import type { ClaudeAuthStatus, ClaudeProfile } from '@minimalcorp/tsunagi-shared';
import { prisma } from './db.js';
import { getTsunagiDataDir } from './data-path.js';

const execFileAsync = promisify(execFile);

/**
 * タブで使う Claude プロファイルの割り当てを保存する予約キー。値はプロファイルの slug か
 * DEFAULT_CLAUDE_PROFILE。環境変数と同じ global → owner → repo の継承で解決し、PTY 起動時に
 * CLAUDE_CONFIG_DIR へ変換する（resolveClaudeProfileEnv）。
 */
export const CLAUDE_PROFILE_ENV_KEY = 'TSUNAGI_CLAUDE_PROFILE';

/** システム既定（CLAUDE_CONFIG_DIR を付けず ~/.claude を使う） */
export const DEFAULT_CLAUDE_PROFILE = 'default';

/**
 * Claude Code が /login のログインより優先する認証情報の環境変数。
 * プロファイルを選んだタブでは、外側 Terminal から継承した値も取り除く（残るとプロファイルの
 * ログインではなくこちらが使われるため）。
 */
export const CLAUDE_AUTH_ENV_KEYS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

/** 汎用の環境変数として登録させないキー（認証は Claude プロファイルで扱う） */
export const RESERVED_ENV_KEYS = [
  CLAUDE_PROFILE_ENV_KEY,
  'CLAUDE_CONFIG_DIR',
  ...CLAUDE_AUTH_ENV_KEYS,
];

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export function getClaudeProfilesDir(): string {
  return path.join(getTsunagiDataDir(), 'claude-profiles');
}

/** プロファイルの CLAUDE_CONFIG_DIR。システム既定は undefined（~/.claude） */
export function getClaudeProfileConfigDir(slug: string): string | undefined {
  if (slug === DEFAULT_CLAUDE_PROFILE) return undefined;
  return path.join(getClaudeProfilesDir(), slug);
}

/** 空白を `-` にし、小文字にする（macOS のファイルシステムは大文字小文字を区別しないため） */
export function toClaudeProfileSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}

/** プロファイル名の検証。問題があればエラーメッセージを返す */
export function validateClaudeProfileName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (!PROFILE_NAME_PATTERN.test(trimmed)) {
    return 'Use only letters, numbers, spaces, "-" and "_"';
  }
  if (toClaudeProfileSlug(trimmed) === DEFAULT_CLAUDE_PROFILE) {
    return `"${DEFAULT_CLAUDE_PROFILE}" is reserved`;
  }
  return null;
}

export async function listClaudeProfiles(): Promise<ClaudeProfile[]> {
  const rows = await prisma.claudeProfile.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    configDir: path.join(getClaudeProfilesDir(), row.slug),
  }));
}

export async function claudeProfileExists(slug: string): Promise<boolean> {
  if (slug === DEFAULT_CLAUDE_PROFILE) return true;
  return (await prisma.claudeProfile.count({ where: { slug } })) > 0;
}

export async function createClaudeProfile(name: string): Promise<ClaudeProfile> {
  const error = validateClaudeProfileName(name);
  if (error) throw new Error(error);
  const trimmed = name.trim();
  const slug = toClaudeProfileSlug(trimmed);
  if (await claudeProfileExists(slug)) {
    throw new Error(`Profile "${slug}" already exists`);
  }
  const configDir = path.join(getClaudeProfilesDir(), slug);
  await fs.mkdir(configDir, { recursive: true });
  await prisma.claudeProfile.create({ data: { slug, name: trimmed } });
  return { slug, name: trimmed, configDir };
}

/**
 * プロファイルを削除する。ログイン情報（macOS は Keychain）を残さないよう先に logout し、
 * このプロファイルを割り当てていたスコープは割り当てを外して親の設定を継承させる。
 */
export async function deleteClaudeProfile(slug: string): Promise<void> {
  const configDir = getClaudeProfileConfigDir(slug);
  if (!configDir) throw new Error('The system default profile cannot be deleted');
  await runClaude(['auth', 'logout'], configDir).catch(() => undefined);
  await prisma.environmentVariable.deleteMany({
    where: { key: CLAUDE_PROFILE_ENV_KEY, value: slug },
  });
  await prisma.claudeProfile.delete({ where: { slug } });
  await fs.rm(configDir, { recursive: true, force: true });
}

/**
 * claude を実行するときの環境変数。プロファイルのログインを見るよう CLAUDE_CONFIG_DIR を付け、
 * ログインより優先される認証情報の環境変数は取り除く。システム既定は外側 Terminal の環境のまま
 * （普段ターミナルで claude を使うときと同じ）。
 */
function claudeEnv(configDir: string | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (configDir) {
    env.CLAUDE_CONFIG_DIR = configDir;
    for (const key of CLAUDE_AUTH_ENV_KEYS) delete env[key];
  }
  return env;
}

async function runClaude(args: string[], configDir: string | undefined): Promise<string> {
  const { stdout } = await execFileAsync('claude', args, {
    env: claudeEnv(configDir),
    timeout: 15_000,
  });
  return stdout;
}

/** `claude auth status --json` でプロファイルのログイン状態を取得する */
export async function getClaudeAuthStatus(slug: string): Promise<ClaudeAuthStatus> {
  try {
    const raw = JSON.parse(
      await runClaude(['auth', 'status', '--json'], getClaudeProfileConfigDir(slug))
    ) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return {
      loggedIn: raw.loggedIn === true,
      authMethod: str(raw.authMethod),
      email: str(raw.email),
      orgName: str(raw.orgName),
      subscriptionType: str(raw.subscriptionType),
    };
  } catch (err) {
    // claude auth status は未ログイン時に非 0 で終了するが、stdout には JSON が出る
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) {
      try {
        const raw = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string };
        return { loggedIn: raw.loggedIn === true, authMethod: raw.authMethod };
      } catch {
        // fallthrough
      }
    }
    return { loggedIn: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** ログイン用 PTY に書き込むコマンド */
export function buildClaudeLoginCommand(): string {
  return 'claude auth login';
}

/** ログイン用 PTY の環境変数（PtyManager.createSession の env / unsetKeys） */
export function claudeLoginPtyEnv(slug: string): {
  env: Record<string, string>;
  unsetKeys: string[];
} {
  const configDir = getClaudeProfileConfigDir(slug);
  if (!configDir) return { env: {}, unsetKeys: [] };
  return { env: { CLAUDE_CONFIG_DIR: configDir }, unsetKeys: CLAUDE_AUTH_ENV_KEYS };
}

/**
 * 継承解決済みの環境変数に含まれるプロファイル割り当てを CLAUDE_CONFIG_DIR に変換する。
 * 予約キー自体は PTY に渡さない。
 */
export function resolveClaudeProfileEnv(env: Record<string, string>): {
  env: Record<string, string>;
  unsetKeys: string[];
} {
  const { [CLAUDE_PROFILE_ENV_KEY]: slug, ...rest } = env;
  const configDir = slug ? getClaudeProfileConfigDir(slug) : undefined;
  // システム既定: 外側 Terminal の環境のまま（普段ターミナルで claude を使うときと同じ）
  if (!configDir) return { env: rest, unsetKeys: [] };
  return { env: { ...rest, CLAUDE_CONFIG_DIR: configDir }, unsetKeys: CLAUDE_AUTH_ENV_KEYS };
}
