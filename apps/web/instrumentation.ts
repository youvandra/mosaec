import * as Sentry from '@sentry/nextjs';

import { SENTRY_BASE } from './lib/sentry-scrub';

/** Server and edge error reporting, on only when a DSN is set. */
export function register(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn === undefined || dsn === '') return;
  Sentry.init({ ...SENTRY_BASE, dsn });
}

export const onRequestError = Sentry.captureRequestError;
