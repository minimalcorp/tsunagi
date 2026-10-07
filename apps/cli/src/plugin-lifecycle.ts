import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Claude Code plugin lifecycle management.
 *
 * Strategy: load the plugin per session via `CLAUDE_CODE_PLUGIN_DIRS`.
 *
 * - The server sets `CLAUDE_CODE_PLUGIN_DIRS` on every PTY it spawns
 *   (apps/server/src/pty-manager.ts), so only Claude sessions started inside
 *   tsunagi load the plugin. Nothing is written to the user's Claude Code
 *   settings, so there is nothing to clean up on shutdown.
 * - Older tsunagi versions installed the plugin into user scope via a local
 *   marketplace. That registration is removed once on startup.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
// dev (tsx): apps/cli/src/plugin-lifecycle.ts → THIS_DIR = apps/cli/src
//   → ../tsunagi-marketplace = apps/cli/tsunagi-marketplace ✓
// prod (compiled): <pkg>/dist/plugin-lifecycle.js → THIS_DIR = <pkg>/dist
//   → ../tsunagi-marketplace = <pkg>/tsunagi-marketplace ✓

const MARKETPLACE_NAME = 'tsunagi-marketplace';
const PLUGIN_NAME = 'tsunagi-plugin';
const PLUGIN_REF = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

// CLAUDE_CODE_PLUGIN_DIRS に対応した最初のバージョン
const MIN_CLAUDE_VERSION = [2, 1, 280] as const;

function getLegacyCleanupMarkerPath(): string {
  const dataDir = process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
  return path.join(dataDir, 'state', 'legacy-plugin-removed');
}

function debugLog(msg: string): void {
  if (process.env.TSUNAGI_DEBUG) {
    console.log(`[tsunagi:plugin] ${msg}`);
  }
}

/** PTY の CLAUDE_CODE_PLUGIN_DIRS に渡すプラグインのディレクトリ（絶対パス） */
export function getPluginDir(): string {
  return path.resolve(THIS_DIR, '..', MARKETPLACE_NAME, 'plugins', PLUGIN_NAME);
}

/** `claude --version` の出力（例: "2.1.292 (Claude Code)"）から x.y.z を取り出す */
function getClaudeVersion(): number[] | null {
  try {
    const output = execSync('claude --version', { stdio: 'pipe' }).toString();
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
    return match ? match.slice(1).map(Number) : null;
  } catch {
    return null;
  }
}

function isAtLeast(version: number[], min: readonly number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    if (version[i] !== min[i]) return version[i] > min[i];
  }
  return true;
}

/**
 * Exits the process with code 1 if the `claude` CLI is missing or too old to
 * load plugins from `CLAUDE_CODE_PLUGIN_DIRS`.
 */
export function assertClaudeSupportsPluginDirs(): void {
  const minLabel = MIN_CLAUDE_VERSION.join('.');
  const version = getClaudeVersion();
  if (!version) {
    console.error('[tsunagi:plugin] Failed to run `claude --version`.');
    console.error('[tsunagi:plugin] Ensure the `claude` CLI is installed and available on PATH.');
    process.exit(1);
  }
  if (!isAtLeast(version, MIN_CLAUDE_VERSION)) {
    console.error(
      `[tsunagi:plugin] Claude Code ${version.join('.')} is too old. tsunagi requires ${minLabel} or later.`
    );
    console.error('[tsunagi:plugin] Run `claude update` and start tsunagi again.');
    process.exit(1);
  }
  debugLog(`Claude Code ${version.join('.')}`);
}

/**
 * Run a `claude` CLI command. Returns true on success, false on failure.
 * Logs stderr on failure to aid debugging.
 */
function runClaude(args: string): boolean {
  try {
    execSync(`claude ${args}`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    const detail = err.stderr?.toString().trim() || err.stdout?.toString().trim() || '';
    if (detail) console.error(`[tsunagi:plugin] claude ${args}: ${detail}`);
    return false;
  }
}

function claudeOutput(args: string): string {
  try {
    return execSync(`claude ${args}`, { stdio: 'pipe' }).toString();
  } catch {
    return '';
  }
}

/**
 * Remove the user-scope plugin / marketplace registered by older tsunagi
 * versions. Runs once; a marker file in the state dir records completion.
 * Never throws and never blocks startup on failure.
 */
export function removeLegacyPluginInstall(): void {
  const markerPath = getLegacyCleanupMarkerPath();
  if (fs.existsSync(markerPath)) return;

  // 存在確認してから消す（未登録時のエラー出力を避ける）
  let removed = true;
  if (claudeOutput('plugin list').includes(PLUGIN_REF)) {
    removed = runClaude(`plugin uninstall ${PLUGIN_REF}`) && removed;
  }
  if (claudeOutput('plugin marketplace list').includes(MARKETPLACE_NAME)) {
    removed = runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`) && removed;
  }
  if (!removed) return; // 次回起動時に再試行する

  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
    debugLog('Legacy plugin registration removed');
  } catch {
    // マーカーを書けなくても次回再確認するだけ
  }
}
