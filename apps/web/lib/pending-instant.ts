import { z } from 'zod';

import { instantQuoteSchema } from './api';

import type { InstantQuote } from './api';
import type { NetworkId } from '@mosaec/config/assets';

/**
 * An instant desk loan waiting for its fill while a redirect wallet signs the offer. The quote
 * lives in React state, which a redirect wipes, so it waits here until the borrower is back.
 */
const KEY = 'mosaec:pending-instant-fill';

const pendingSchema = z.object({
  network: z.string(),
  pack: z.string(),
  quote: instantQuoteSchema,
});

export interface PendingInstantFill {
  readonly network: NetworkId;
  readonly pack: string;
  readonly quote: InstantQuote;
}

export function savePendingInstant(pending: PendingInstantFill): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* Storage off (private mode): a redirect wallet then leaves the offer on the market. */
  }
}

export function clearPendingInstant(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing stored. */
  }
}

/** The stored fill for `network` while its quote still stands, or null. */
export function loadPendingInstant(network: NetworkId, nowMs: number): PendingInstantFill | null {
  let stored: unknown;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = pendingSchema.safeParse(stored);
  if (!parsed.success || parsed.data.network !== network) return null;
  if (parsed.data.quote.expiresAtMs <= nowMs) {
    clearPendingInstant();
    return null;
  }
  return { network, pack: parsed.data.pack, quote: parsed.data.quote };
}
