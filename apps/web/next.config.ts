import path from 'node:path';

import type { NextConfig } from 'next';

function apiOrigin(): string {
  return process.env.MOSAEC_API_URL ?? 'https://api.mosaec.finance';
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  transpilePackages: ['@mosaec/ui', '@mosaec/sdk', '@mosaec/domain', '@mosaec/config'],
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react'],
  },
  // The browser calls the API through this origin, so the API needs no CORS entry per host.
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiOrigin()}/:path*` }]);
  },
  // Lint runs once from the repository root with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
