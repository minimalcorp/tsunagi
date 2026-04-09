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

let cleanedUp = false;
function cleanup(): void {
  if (cleanedUp) return;
  cleanedUp = true;
  cleanupPluginState();
}

ensureCleanPluginState();

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', () => {
  cleanup();
});
process.on('uncaughtException', (err) => {
  console.error('[tsunagi] Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

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

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
