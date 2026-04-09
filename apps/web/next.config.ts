import type { NextConfig } from 'next';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(CONFIG_DIR, '..', '..');

const nextConfig: NextConfig = {
  // Emit a self-contained production build at .next/standalone so the npm
  // package can ship without bundling the full node_modules tree.
  output: 'standalone',
  // In npm workspaces, Turbopack and the standalone tracer must agree on a
  // single workspace root. The hoisted node_modules lives at the monorepo
  // root, so both have to anchor there. The resulting standalone layout is
  // nested at .next/standalone/apps/web/server.js.
  outputFileTracingRoot: MONOREPO_ROOT,
  turbopack: {
    root: MONOREPO_ROOT,
  },
};

export default nextConfig;
