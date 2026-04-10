#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cleanupPluginState, ensureCleanPluginState } from './plugin-lifecycle.js';

/**
 * Development wrapper:
 *   1. Install Claude Code plugin (clean install)
 *   2. Spawn `npm run dev -w @minimalcorp/tsunagi-web` and
 *      `npm run dev -w @minimalcorp/tsunagi-server` concurrently
 *
 * Used by `npm run dev` (root) → `npm run dev -w @minimalcorp/tsunagi`
 * → `tsx src/with-plugin.ts dev`.
 */

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: tsx src/with-plugin.ts <dev|start>');
  process.exit(1);
}

ensureCleanPluginState();

const webCmd =
  mode === 'dev'
    ? 'npm run dev -w @minimalcorp/tsunagi-web'
    : 'npm run start -w @minimalcorp/tsunagi-web';
const serverCmd =
  mode === 'dev'
    ? 'npm run dev -w @minimalcorp/tsunagi-server'
    : 'npm exec --workspace @minimalcorp/tsunagi-server tsx src/index.ts';

const child = spawn(
  'npx',
  [
    'concurrently',
    '--kill-others',
    '--names',
    'web,server',
    '--prefix-colors',
    'blue,green',
    `"${webCmd}"`,
    `"${serverCmd}"`,
  ],
  {
    stdio: 'inherit',
    shell: true,
  }
);

let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!child.killed && child.exitCode === null) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  cleanupPluginState();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  if (!shuttingDown) cleanupPluginState();
});
process.on('uncaughtException', (err) => {
  console.error('[tsunagi] Uncaught exception:', err);
  shutdown(1);
});

child.on('exit', (code) => {
  shutdown(code ?? 0);
});
