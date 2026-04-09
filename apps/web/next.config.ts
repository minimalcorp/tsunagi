import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emit a self-contained production build at .next/standalone so the npm
  // package can ship without bundling the full node_modules tree.
  output: 'standalone',
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
