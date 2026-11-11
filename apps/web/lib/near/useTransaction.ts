'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { ERROR_CATALOG } from '@mosaec/domain';

import { useWallet } from './wallet';

import type { SentTransaction } from './transactions';
import type { ContractCall } from '@mosaec/sdk';

export type TxState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'pending' }
  | { readonly phase: 'success'; readonly transactions: readonly SentTransaction[] }
  | { readonly phase: 'error'; readonly message: string; readonly hash?: string };

/** Plain words for a finished transaction that did not settle. */
function failureMessage(tx: SentTransaction): string {
  const { outcome } = tx;
  if (outcome.code !== undefined) {
    const text = ERROR_CATALOG[outcome.code].message;
    return outcome.refunded ? `${text} Your payment came back in full.` : text;
  }
  return outcome.status === 'refused'
    ? 'The contract declined the request. Any payment came back in full.'
    : 'The transaction failed on chain.';
}

/** Sends calls through the connected wallet and reports the result in the catalog's words. */
export function useTransaction() {
  const { send } = useWallet();
  const router = useRouter();
  const [state, setState] = useState<TxState>({ phase: 'idle' });

  const run = useCallback(
    async (calls: readonly ContractCall[]): Promise<readonly SentTransaction[] | null> => {
      setState({ phase: 'pending' });
      try {
        const result = await send(calls);
        if (result.kind === 'redirected') return null;
        const failed = result.transactions.find((tx) => tx.outcome.status !== 'settled');
        if (failed !== undefined) {
          setState({ phase: 'error', message: failureMessage(failed), hash: failed.hash });
          return null;
        }
        setState({ phase: 'success', transactions: result.transactions });
        router.refresh();
        return result.transactions;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'The wallet did not sign.';
        setState({ phase: 'error', message });
        return null;
      }
    },
    [send, router],
  );

  const reset = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  return { state, run, reset };
}
