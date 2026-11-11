import path from 'node:path';

import { withSentryConfig } from '@sentry/nextjs/config';

import type { NextConfig } from 'next';

function apiOrigin(): string {
  return process.env.MOSAEC_API_URL ?? 'http://127.0.0.1:8787';
}

function originOf(url: string | undefined): string | null {
  if (url === undefined || url === '') return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Content policy for a page that asks wallets to sign. Scripts stay first-party (plus the
 * analytics host when set); frames of this site are refused everywhere, so no other page can
 * dress up a signing button. Wallets and RPCs speak over any HTTPS or WSS origin.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== 'production';
  const analytics = originOf(process.env.NEXT_PUBLIC_UMAMI_URL);
  const scripts = ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])];
  if (analytics !== null) scripts.push(analytics);
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https: wss:${dev ? ' ws:' : ''}`,
    'frame-src https:',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
];

const config: NextConfig = {
  reactStrictMode: true,
  // A second local dev server needs its own build folder, or the two overwrite each other's manifests.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
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
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]);
  },
  // Lint runs once from the repository root with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
};

/*
 * Sentry build hooks: server and route instrumentation, plus source map upload when
 * SENTRY_AUTH_TOKEN is set at build time. Without the token the upload is skipped.
 */
export default withSentryConfig(config, {
  org: 'mosaec',
  project: 'mosaec-web',
  silent: !process.env.CI,
  telemetry: false,
});
