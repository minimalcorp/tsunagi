import type { NextConfig } from 'next';
import * as path from 'node:path';

const MONOREPO_ROOT = path.resolve(__dirname, '..', '..');

const nextConfig: NextConfig = {
  // Emit a self-contained production build at .next/standalone so the npm
  // package can ship without bundling the full node_modules tree.
  output: 'standalone',
  // In npm workspaces, Turbopack (default in Next 16) and the standalone
  // tracer must agree on a single workspace root. The hoisted node_modules
  // lives at the monorepo root, so both have to anchor there. The
  // resulting standalone layout is nested at
  //   .next/standalone/apps/web/server.js
  // and scripts/cli.ts is responsible for spawning that nested entry.
  outputFileTracingRoot: MONOREPO_ROOT,
  turbopack: {
    root: MONOREPO_ROOT,
  },
  serverExternalPackages: ['@prisma/client', 'better-sqlite3'],
  async rewrites() {
    return [
      {
        source: '/api/terminal/:path*',
        destination: 'http://localhost:2792/api/terminal/:path*',
      },
    ];
  },
};

export default nextConfig;
