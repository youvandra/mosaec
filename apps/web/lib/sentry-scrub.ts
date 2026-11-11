import type { ErrorEvent } from '@sentry/nextjs';

/** NEAR names of people. Mosaec's own contracts and NEAR Intents stay readable. */
const ACCOUNT = /\b[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:near|testnet)\b|\b[0-9a-f]{64}\b/g;
const OURS = /(?:^|\.)(?:mosaec\.(?:near|testnet)|intents\.near)$/;

export function scrubText(text: string): string {
  return text.replace(ACCOUNT, (name) => (OURS.test(name) ? name : '[account]'));
}

/**
 * Drops everything that could name a person before an error leaves the browser or server: the
 * user block, IPs, headers, cookies, query strings, and NEAR account names in any text.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request !== undefined) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.data;
    if (event.request.url !== undefined) event.request.url = scrubText(event.request.url);
  }
  if (event.message !== undefined) event.message = scrubText(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value !== undefined) value.value = scrubText(value.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message !== undefined) crumb.message = scrubText(crumb.message);
    if (crumb.data !== undefined) {
      crumb.data = JSON.parse(scrubText(JSON.stringify(crumb.data))) as typeof crumb.data;
    }
  }
  return event;
}

/** Shared options; the DSN comes from the environment, so builds without one send nothing. */
export const SENTRY_BASE = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_MOSAEC_ENV ?? process.env.NODE_ENV,
  beforeSend: scrubEvent,
} as const;
