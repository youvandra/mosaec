'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getInstantQuote } from '../../../lib/api';

import type { InstantQuote, InstantQuoteRequest } from '../../../lib/api';
import type { NetworkId } from '@mosaec/config/assets';

/** Quotes are asked again this long after the inputs settle. */
const DEBOUNCE_MS = 400;
/** A quote closer than this to expiry is refreshed before the wallet opens. */
export const QUOTE_MARGIN_MS = 60_000;

export type QuoteState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly quote: InstantQuote }
  | { readonly status: 'unavailable'; readonly reason: string };

/**
 * The House Desk's live quote for the coins in a pack. `null` request means nothing to quote yet.
 * `fresh()` returns a quote with at least a minute left, asking again when the held one is close
 * to expiry.
 */
export function useInstantQuote(network: NetworkId, request: InstantQuoteRequest | null) {
  const [state, setState] = useState<QuoteState>({ status: 'idle' });
  const latest = useRef(request);
  latest.current = request;
  const key =
    request === null
      ? null
      : [
          request.asset,
          request.amount.toString(),
          request.termNs.toString(),
          request.principal?.toString() ?? '',
          request.borrower ?? '',
        ].join(':');

  const ask = useCallback(async (): Promise<QuoteState> => {
    const current = latest.current;
    if (current === null) return { status: 'idle' };
    try {
      const answer = await getInstantQuote(network, current);
      return answer.available
        ? { status: 'ready', quote: answer.quote }
        : { status: 'unavailable', reason: answer.reason };
    } catch (cause) {
      const reason =
        cause instanceof ApiError ? cause.message : 'The House Desk is unreachable right now.';
      return { status: 'unavailable', reason };
    }
  }, [network]);

  useEffect(() => {
    if (key === null) {
      setState({ status: 'idle' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      void ask().then((next) => {
        if (live) setState(next);
      });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [key, ask]);

  const fresh = useCallback(async (): Promise<QuoteState> => {
    if (state.status === 'ready' && state.quote.expiresAtMs - Date.now() > QUOTE_MARGIN_MS) {
      return state;
    }
    const next = await ask();
    setState(next);
    return next;
  }, [state, ask]);

  return { state, fresh };
}
