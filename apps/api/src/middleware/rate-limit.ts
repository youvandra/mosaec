import { MosaecError } from '@mosaec/domain';

import type { MiddlewareHandler } from 'hono';

const WINDOW_MS = 60_000;

/** First address in `X-Forwarded-For`, set by the reverse proxy in front of the API. */
export function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() ?? 'direct';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Socket address of the caller, when the Node server exposes it. */
function remoteAddress(env: unknown): string | undefined {
  const incoming = (env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  return incoming?.socket?.remoteAddress;
}

/**
 * Fixed one-minute window per client address, in memory (one API process per host).
 *
 * Public traffic always arrives through Caddy, which sets `X-Forwarded-For`. A loopback caller
 * without that header is the web server rendering a page; it serves every visitor, so it is not
 * held to one visitor's budget.
 */
export function rateLimit(perMinute: number, nowMs: () => number = Date.now): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = nowMs();
    const forwarded = c.req.header('x-forwarded-for');
    const socket = remoteAddress(c.env);
    if (forwarded === undefined && socket !== undefined && LOOPBACK.has(socket)) {
      await next();
      return;
    }
    const key = forwarded === undefined ? (socket ?? 'direct') : clientIp(forwarded);
    const current = windows.get(key);
    const window =
      current === undefined || now - current.start >= WINDOW_MS
        ? { start: now, count: 0 }
        : current;
    window.count += 1;
    windows.set(key, window);
    if (windows.size > 10_000) {
      for (const [k, w] of windows) {
        if (now - w.start >= WINDOW_MS) {
          windows.delete(k);
        }
      }
    }
    if (window.count > perMinute) {
      c.header('Retry-After', Math.ceil((window.start + WINDOW_MS - now) / 1_000).toString());
      throw new MosaecError('RATE_LIMITED');
    }
    await next();
  };
}
