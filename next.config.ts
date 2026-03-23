import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
