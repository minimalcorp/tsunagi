#!/usr/bin/env node
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
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
ensureCleanPluginState();

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
