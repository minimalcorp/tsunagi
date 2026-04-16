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

// ---------------------------------------------------------------------------
// Braille-dots spinner
// ---------------------------------------------------------------------------
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(message: string): { stop: () => void } {
  let i = 0;
  // Write first frame immediately so it shows even during spawnSync/execSync blocking
  process.stdout.write(`\r${SPINNER_FRAMES[0]} ${message}`);
  i++;
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

if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.error(`[tsunagi] Unsupported platform: ${process.platform}`);
  console.error('[tsunagi] Tsunagi currently supports macOS and Linux only.');
  process.exit(1);
}

let spinner = createSpinner('Initializing...');

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
const DOCS_DIR = path.join(PACKAGE_ROOT, 'docs');
const DOCS_PORT = 2793;

const isDebug = !!process.env.TSUNAGI_DEBUG;
const isDocker = fs.existsSync('/.dockerenv');

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
ensureCleanPluginState();

// ---------------------------------------------------------------------------
// Docs static file server
// ---------------------------------------------------------------------------
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

function startDocsServer(): http.Server | null {
  if (!fs.existsSync(DOCS_DIR)) return null;

  const serveFile = (filePath: string, res: http.ServerResponse) => {
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  };

  const server = http.createServer((req, res) => {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }

    const filePath = path.resolve(DOCS_DIR, '.' + urlPath);
    if (!filePath.startsWith(DOCS_DIR)) {
      res.writeHead(403).end();
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err) {
        res.writeHead(404).end();
        return;
      }
      if (stat.isDirectory()) {
        if (!urlPath.endsWith('/')) {
          res.writeHead(301, { Location: urlPath + '/' }).end();
          return;
        }
        serveFile(path.join(filePath, 'index.html'), res);
      } else {
        serveFile(filePath, res);
      }
    });
  });

  server.listen(DOCS_PORT, '0.0.0.0');
  return server;
}

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

const docsServer = startDocsServer();

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

  const url = `http://localhost:${PORT}`;

  if (!isDocker) {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  }

  console.log(`Open ${url}`);
  if (docsServer) {
    console.log(`Docs http://localhost:${DOCS_PORT}`);
  }
});

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------
let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

  spinner.stop();

  const cleanupSpinner = createSpinner('Cleaning up...');
  for (const child of [fastifyChild, nextChild]) {
    if (child && !child.killed && child.exitCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
  docsServer?.close();

  cleanupPluginState();
  cleanupSpinner.stop();
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
