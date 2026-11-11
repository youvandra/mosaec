import type * as Sentry from '@sentry/nextjs';

/**
 * Error reporting that costs nothing until it is switched on: the Sentry SDK loads only in a
 * browser built with a DSN, on the first report or at start-up.
 */
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

type SentryModule = typeof Sentry;
let loading: Promise<SentryModule> | null = null;

export function sentry(): Promise<SentryModule> | null {
  if (DSN === '' || typeof window === 'undefined') return null;
  loading ??= Promise.all([import('@sentry/nextjs'), import('./sentry-scrub')]).then(
    ([sdk, { SENTRY_BASE }]) => {
      sdk.init({ ...SENTRY_BASE, dsn: DSN });
      return sdk;
    },
  );
  return loading;
}

export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  void sentry()?.then((sdk) => sdk.captureException(error, { tags }));
}

export function reportWarning(message: string, tags: Record<string, string> = {}): void {
  void sentry()?.then((sdk) => sdk.captureMessage(message, { level: 'warning', tags }));
}
