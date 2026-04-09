import { spawn } from 'node:child_process';
import { cleanupPluginState, ensureCleanPluginState } from './plugin-lifecycle';

/**
 * Development wrapper: install the Claude Code plugin, then start next +
 * fastify concurrently. Used by `npm run dev` / `npm run start` during local
 * development.
 *
 * The production CLI (`dist/cli/index.js`) also composes plugin-lifecycle +
 * server startup, but without relying on the `concurrently` package.
 */

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: tsx scripts/with-plugin.ts <dev|start>');
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

const nextCmd = mode === 'dev' ? 'next dev -p 2791' : 'next start -p 2791';
const fastifyCmd = mode === 'dev' ? 'tsx watch server/index.ts' : 'tsx server/index.ts';

const child = spawn(
  'npx',
  [
    'concurrently',
    '--kill-others',
    '--names',
    'next,fastify',
    '--prefix-colors',
    'blue,green',
    `"${nextCmd}"`,
    `"${fastifyCmd}"`,
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
