import { MosaecError } from '@mosaec/domain';

import type { MiddlewareHandler } from 'hono';

const WINDOW_MS = 60_000;

/** First address in `X-Forwarded-For`, set by the reverse proxy in front of the API. */
export function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() ?? 'direct';
}

/** Fixed one-minute window per client address, in memory (one API process per host). */
export function rateLimit(perMinute: number, nowMs: () => number = Date.now): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = nowMs();
    const key = clientIp(c.req.header('x-forwarded-for'));
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
