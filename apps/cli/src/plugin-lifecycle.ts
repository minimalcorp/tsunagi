import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Claude Code plugin lifecycle management.
 *
 * Strategy: clean install on startup, unconditional uninstall on shutdown.
 *
 * - Uses only the `claude` CLI commands; no direct manipulation of
 *   `~/.claude/settings.json` or other internal files.
 * - On startup, any pre-existing tsunagi marketplace / plugin is considered
 *   an orphan from a previous abnormal termination and is cleaned up before
 *   installing a fresh copy. This is safe because tsunagi enforces single
 *   instance via the PID lock.
 * - On shutdown, uninstall is attempted unconditionally and failures are
 *   ignored so that cleanup never blocks process exit.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
// dev (tsx): apps/cli/src/plugin-lifecycle.ts → THIS_DIR = apps/cli/src
//   → ../tsunagi-marketplace = apps/cli/tsunagi-marketplace ✓
// prod (compiled): <pkg>/dist/plugin-lifecycle.js → THIS_DIR = <pkg>/dist
//   → ../tsunagi-marketplace = <pkg>/tsunagi-marketplace ✓

const MARKETPLACE_NAME = 'tsunagi-marketplace';
const PLUGIN_REF = `tsunagi-plugin@${MARKETPLACE_NAME}`;

function getMarketplaceDir(): string {
  const candidate = path.resolve(THIS_DIR, '..', 'tsunagi-marketplace');
  if (fs.existsSync(path.join(candidate, '.claude-plugin'))) {
    return candidate;
  }
  // Fallback for unexpected layouts
  return candidate;
}

function debugLog(msg: string): void {
  if (process.env.TSUNAGI_DEBUG) {
    console.log(`[tsunagi:plugin] ${msg}`);
  }
}

/** プラグインがインストール済みか確認する */
function isPluginInstalled(): boolean {
  try {
    const output = execSync('claude plugin list', { stdio: 'pipe' }).toString();
    return output.includes(PLUGIN_REF);
  } catch {
    return false;
  }
}

/** marketplaceが登録済みか確認する */
function isMarketplaceAdded(): boolean {
  try {
    const output = execSync('claude plugin marketplace list', { stdio: 'pipe' }).toString();
    return output.includes(MARKETPLACE_NAME);
  } catch {
    return false;
  }
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

/**
 * Ensure a clean plugin state by removing any pre-existing tsunagi plugin /
 * marketplace registrations and then installing fresh copies.
 *
 * Exits the process with code 1 on install failure.
 *
 * @returns `'clean'` if orphaned state was cleaned up before install,
 *          `'fresh'` if no prior state existed.
 */
export function ensureCleanPluginState(): 'clean' | 'fresh' {
  // Phase 1: best-effort cleanup of any orphaned state from a previous run.
  // Check existence first to avoid error output when plugin is not installed (normal first-boot case).
  const hadOrphan = isPluginInstalled() || isMarketplaceAdded();
  if (isPluginInstalled()) {
    runClaude(`plugin uninstall ${PLUGIN_REF}`);
  }
  if (isMarketplaceAdded()) {
    runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`);
  }

  // Phase 2: clean install. Failures here are fatal.
  const marketplaceDir = getMarketplaceDir();
  if (!runClaude(`plugin marketplace add ${marketplaceDir}`)) {
    console.error('[tsunagi:plugin] Failed to add Claude Code marketplace.');
    console.error('[tsunagi:plugin] Ensure the `claude` CLI is installed and available on PATH.');
    console.error(`[tsunagi:plugin] Marketplace path: ${marketplaceDir}`);
    process.exit(1);
  }
  debugLog('Marketplace added');

  if (!runClaude(`plugin install ${PLUGIN_REF} --scope user`)) {
    console.error('[tsunagi:plugin] Failed to install Claude Code plugin.');
    runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`);
    process.exit(1);
  }
  debugLog('Plugin installed');

  return hadOrphan ? 'clean' : 'fresh';
}

/**
 * Best-effort cleanup. Called on process shutdown. Never throws.
 */
export function cleanupPluginState(): void {
  runClaude(`plugin uninstall ${PLUGIN_REF}`);
  runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`);
}
