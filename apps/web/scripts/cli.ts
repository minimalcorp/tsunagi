#!/usr/bin/env node
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cleanupPluginState, ensureCleanPluginState } from './plugin-lifecycle';
import { acquireSingleInstanceLock } from './single-instance-lock';

/**
 * Production CLI entrypoint shipped as `bin` in the npm package.
 *
 * Startup sequence:
 *   1. Platform check (macOS / Linux only)
 *   2. Acquire single-instance PID lock
 *   3. Run database migrations (`auto-migrate`)
 *   4. Clean-install Claude Code marketplace + plugin
 *   5. Spawn Fastify server child process
 *   6. Spawn Next.js standalone server child process
 *   7. On shutdown: kill children + release plugin state + release lock
 */

// -- 1. Platform check ------------------------------------------------------

if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.error(`[tsunagi] Unsupported platform: ${process.platform}`);
  console.error('[tsunagi] Tsunagi currently supports macOS and Linux only.');
  process.exit(1);
}

// -- 2. Single instance lock ------------------------------------------------

acquireSingleInstanceLock();

// -- Resolve package layout -------------------------------------------------
//
// When installed via npm, files are laid out as:
//
//   <pkg>/dist/scripts/cli.js              ← this file
//   <pkg>/dist/scripts/auto-migrate.js
//   <pkg>/dist/server/index.js
//   <pkg>/.next/standalone/server.js       ← Next.js standalone entry
//   <pkg>/prisma/schema.prisma
//
// `__dirname` points at <pkg>/dist/scripts. Walk up to the package root.

const DIST_SCRIPTS_DIR = __dirname;
const PACKAGE_ROOT = path.resolve(DIST_SCRIPTS_DIR, '..', '..');
const AUTO_MIGRATE_JS = path.join(DIST_SCRIPTS_DIR, 'auto-migrate.js');
const FASTIFY_ENTRY_JS = path.join(PACKAGE_ROOT, 'dist', 'server', 'index.js');
const NEXT_STANDALONE_ENTRY = path.join(PACKAGE_ROOT, '.next', 'standalone', 'server.js');

// -- 3. Database migration --------------------------------------------------

function runAutoMigrate(): void {
  if (!fs.existsSync(AUTO_MIGRATE_JS)) {
    console.error(`[tsunagi] Missing build artifact: ${AUTO_MIGRATE_JS}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [AUTO_MIGRATE_JS], {
    stdio: 'inherit',
    cwd: PACKAGE_ROOT,
  });
  if (result.status !== 0) {
    console.error('[tsunagi] Database migration failed.');
    process.exit(result.status ?? 1);
  }
}

runAutoMigrate();

// -- 4. Claude Code plugin clean install ------------------------------------

ensureCleanPluginState();

// -- 5 & 6. Spawn server child processes ------------------------------------

function verifyArtifact(p: string, label: string): void {
  if (!fs.existsSync(p)) {
    console.error(`[tsunagi] Missing ${label}: ${p}`);
    console.error('[tsunagi] The package appears to be incomplete. Please reinstall.');
    process.exit(1);
  }
}

verifyArtifact(FASTIFY_ENTRY_JS, 'Fastify server artifact');
verifyArtifact(NEXT_STANDALONE_ENTRY, 'Next.js standalone artifact');

const fastifyChild: ChildProcess = spawn(process.execPath, [FASTIFY_ENTRY_JS], {
  stdio: 'inherit',
  cwd: PACKAGE_ROOT,
  env: process.env,
});

const nextChild: ChildProcess = spawn(process.execPath, [NEXT_STANDALONE_ENTRY], {
  stdio: 'inherit',
  cwd: path.dirname(NEXT_STANDALONE_ENTRY),
  env: { ...process.env, PORT: process.env.PORT ?? '2791' },
});

// -- 7. Shutdown orchestration ----------------------------------------------

let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

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
  // single-instance-lock releases its lock via its own `exit` hook.
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

fastifyChild.on('exit', (code) => {
  console.error(`[tsunagi] Fastify server exited with code ${code}`);
  shutdown(code ?? 1);
});
nextChild.on('exit', (code) => {
  console.error(`[tsunagi] Next.js server exited with code ${code}`);
  shutdown(code ?? 1);
});
