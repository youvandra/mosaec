import path from 'node:path';

import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Lint runs once from the repository root with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
