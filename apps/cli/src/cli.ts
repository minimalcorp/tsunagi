#!/usr/bin/env node
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupPluginState, ensureCleanPluginState } from './plugin-lifecycle.js';
import { acquireSingleInstanceLock } from './single-instance-lock.js';

/**
 * Production CLI entrypoint shipped as `bin` in @minimalcorp/tsunagi.
 *
 * Layout when installed via npm:
 *
 *   <pkg>/dist/cli.js                            ← this file
 *   <pkg>/dist/auto-migrate.js
 *   <pkg>/dist/plugin-lifecycle.js
 *   <pkg>/dist/single-instance-lock.js
 *   <pkg>/dist/server/index.js                   ← Fastify entry (bundled from apps/server/dist)
 *   <pkg>/dist/server/lib/**
 *   <pkg>/dist/server/generated/prisma/**
 *   <pkg>/.next/standalone/apps/web/server.js    ← Next.js standalone entry (bundled from apps/web/.next/standalone)
 *   <pkg>/.next/standalone/apps/web/.next/static/
 *   <pkg>/.next/standalone/node_modules/
 *   <pkg>/prisma/schema.prisma
 *   <pkg>/prisma.config.ts
 *   <pkg>/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin/plugin.json
 */

if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.error(`[tsunagi] Unsupported platform: ${process.platform}`);
  console.error('[tsunagi] Tsunagi currently supports macOS and Linux only.');
  process.exit(1);
}

acquireSingleInstanceLock();

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(DIST_DIR, '..');
const AUTO_MIGRATE_JS = path.join(DIST_DIR, 'auto-migrate.js');
const FASTIFY_ENTRY_JS = path.join(DIST_DIR, 'server', 'index.js');
const NEXT_STANDALONE_ENTRY = path.join(
  PACKAGE_ROOT,
  '.next',
  'standalone',
  'apps',
  'web',
  'server.js'
);

const isDebug = !!process.env.TSUNAGI_DEBUG;

// ---------------------------------------------------------------------------
// Braille-dots spinner
// ---------------------------------------------------------------------------
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(message: string): { stop: () => void } {
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[i % SPINNER_FRAMES.length]} ${message}`);
    i++;
  }, 80);

  return {
    stop() {
      clearInterval(timer);
      // Clear the spinner line
      process.stdout.write('\r' + ' '.repeat(message.length + 4) + '\r');
    },
  };
}

// ---------------------------------------------------------------------------
// ASCII art
// ---------------------------------------------------------------------------
const TSUNAGI_AA = `
  __                          _
 / /____ __ _____  ___ ____ _(_)
/ __(_-</ // / _ \\/ _ \`/ _ \`/ /
\\__/___/\\_,_/_//_/\\_,_/\\_, /_/
                      /___/
`;

// ---------------------------------------------------------------------------
// Phase 1: Auto-migrate (synchronous child process)
// ---------------------------------------------------------------------------
function runAutoMigrate(): void {
  if (!fs.existsSync(AUTO_MIGRATE_JS)) {
    console.error(`[tsunagi] Missing build artifact: ${AUTO_MIGRATE_JS}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [AUTO_MIGRATE_JS], {
    stdio: isDebug ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    cwd: PACKAGE_ROOT,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    if (stderr) console.error(stderr);
    console.error('[tsunagi] Database migration failed.');
    process.exit(result.status ?? 1);
  }
  // Display migration result (e.g. "1 migration applied.")
  const stdout = result.stdout?.toString().trim();
  if (stdout) console.log(stdout);
}

runAutoMigrate();

// ---------------------------------------------------------------------------
// Phase 2: Plugin lifecycle
// ---------------------------------------------------------------------------
const pluginResult = ensureCleanPluginState();
console.log(
  pluginResult === 'clean' ? 'clean installed tsunagi plugin' : 'installed tsunagi plugin'
);

// ---------------------------------------------------------------------------
// Phase 3: Verify build artifacts & spawn servers
// ---------------------------------------------------------------------------
function verifyArtifact(p: string, label: string): void {
  if (!fs.existsSync(p)) {
    console.error(`[tsunagi] Missing ${label}: ${p}`);
    console.error('[tsunagi] The package appears to be incomplete. Please reinstall.');
    process.exit(1);
  }
}

verifyArtifact(FASTIFY_ENTRY_JS, 'Fastify server artifact');
verifyArtifact(NEXT_STANDALONE_ENTRY, 'Next.js standalone artifact');

const PORT = process.env.PORT ?? '2791';

const spinner = createSpinner('Initializing...');

const fastifyChild: ChildProcess = spawn(process.execPath, [FASTIFY_ENTRY_JS], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: PACKAGE_ROOT,
  env: { ...process.env, NODE_ENV: 'production' },
});

const nextChild: ChildProcess = spawn(process.execPath, [NEXT_STANDALONE_ENTRY], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: path.dirname(NEXT_STANDALONE_ENTRY),
  env: { ...process.env, PORT, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' },
});

// ---------------------------------------------------------------------------
// Child process output forwarding
// ---------------------------------------------------------------------------
fastifyChild.stdout?.on('data', (data: Buffer) => {
  if (isDebug) process.stdout.write(data);
});
fastifyChild.stderr?.on('data', (data: Buffer) => {
  process.stderr.write(data);
});
nextChild.stdout?.on('data', (data: Buffer) => {
  if (isDebug) process.stdout.write(data);
});
nextChild.stderr?.on('data', (data: Buffer) => {
  process.stderr.write(data);
});

// ---------------------------------------------------------------------------
// Ready detection via /health polling
// ---------------------------------------------------------------------------
const SERVER_PORT = 2792;
const POLL_INTERVAL_MS = 300;

function pollHealth(port: number): Promise<void> {
  return new Promise((resolve) => {
    const poll = () => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
        } else {
          res.resume();
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      });
      req.on('error', () => {
        setTimeout(poll, POLL_INTERVAL_MS);
      });
    };
    poll();
  });
}

Promise.all([pollHealth(SERVER_PORT), pollHealth(Number(PORT))]).then(() => {
  spinner.stop();
  console.log(TSUNAGI_AA);
  console.log(`Open http://localhost:${PORT}`);
});

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------
let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

  spinner.stop();

  for (const child of [fastifyChild, nextChild]) {
    if (child && !child.killed && child.exitCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
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

fastifyChild.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[tsunagi] Fastify server exited unexpectedly (code ${code})`);
    shutdown(code ?? 1);
  }
});
nextChild.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[tsunagi] Next.js server exited unexpectedly (code ${code})`);
    shutdown(code ?? 1);
  }
});
