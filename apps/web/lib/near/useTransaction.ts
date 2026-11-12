'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { explorerTxUrl } from '@mosaec/config/networks';
import { ERROR_CATALOG } from '@mosaec/domain';
import { useToast } from '@mosaec/ui';

import { reportError, reportWarning } from '../report';

import { announceChainChange } from './chain-change';
import { markConfirming, packsOf } from './confirming';
import { useNetwork } from './network';
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

/* The indexer trails the chain by 10 to 45 s (finality plus the transactions API). */
const REFRESH_AFTER_MS = [3_000, 8_000, 15_000, 30_000, 45_000, 60_000, 90_000] as const;

export interface TxMessages {
  /** Toast title while the wallet signs, such as "Filling pawn #4". */
  readonly pending?: string;
  /** Toast title once every transaction settled. */
  readonly success?: string;
}

/**
 * Sends calls through the connected wallet and reports the result in one toast that moves from
 * pending to done; errors stay until dismissed. `state` drives the button only.
 */
export function useTransaction(messages: TxMessages = {}) {
  const { send } = useWallet();
  const { network } = useNetwork();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<TxState>({ phase: 'idle' });
  const { pending = 'Confirm in your wallet', success = 'Transaction settled' } = messages;

  const run = useCallback(
    async (
      calls: readonly ContractCall[],
      override: TxMessages = {},
    ): Promise<readonly SentTransaction[] | null> => {
      setState({ phase: 'pending' });
      const id = toast.show({
        tone: 'pending',
        title: override.pending ?? pending,
        body: 'Approve the request in your wallet. It settles in a few seconds.',
      });
      const link = (hash: string | undefined) =>
        hash === undefined
          ? undefined
          : { label: 'View transaction', href: explorerTxUrl(network, hash) };
      try {
        const result = await send(calls);
        if (result.kind === 'redirected') {
          toast.dismiss(id);
          return null;
        }
        const failed = result.transactions.find((tx) => tx.outcome.status !== 'settled');
        if (failed !== undefined) {
          const message = failureMessage(failed);
          reportWarning('transaction not settled', {
            area: 'tx',
            code: failed.outcome.code ?? failed.outcome.status,
          });
          setState({ phase: 'error', message, hash: failed.hash });
          toast.update(id, {
            tone: 'error',
            title: 'Not settled',
            body: message,
            action: link(failed.hash),
            duration: null,
          });
          return null;
        }
        setState({ phase: 'success', transactions: result.transactions });
        const lastHash = result.transactions.at(-1)?.hash;
        if (lastHash !== undefined) markConfirming(calls.flatMap(packsOf), lastHash);
        toast.update(id, {
          tone: 'success',
          title: override.success ?? success,
          action: link(result.transactions.at(-1)?.hash),
        });
        /*
         * Refresh now and again as the indexer catches up; the timers follow the person to the next
         * page. Server pages refresh through the router, client views through the chain signal.
         */
        const beat = () => {
          router.refresh();
          announceChainChange();
        };
        /* Chain views read final state, which trails the wallet's answer by a few blocks. */
        router.refresh();
        for (const ms of REFRESH_AFTER_MS) window.setTimeout(beat, ms);
        return result.transactions;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'The wallet did not sign.';
        /* A person closing the wallet is a choice, not a fault. */
        if (!/reject|cancel|denied|closed|user/i.test(message)) {
          reportError(cause, { area: 'wallet-send' });
        }
        setState({ phase: 'error', message });
        toast.update(id, {
          tone: 'error',
          title: 'Wallet did not sign',
          body: message,
          duration: null,
        });
        return null;
      }
    },
    [send, router, toast, network, pending, success],
  );

  const reset = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  return { state, run, reset };
}
