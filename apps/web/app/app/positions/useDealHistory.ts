'use client';

import { useEffect, useState } from 'react';

import { getPack, listPacks } from '../../../lib/api';
import { dealOf } from '../../../lib/deal';
import { useNetwork } from '../../../lib/near/network';

import type { Deal } from '../../../lib/deal';

export interface HistoryEntry {
  readonly packId: string;
  readonly index: string;
  readonly role: 'lender' | 'borrower';
  readonly deal: Deal;
}

const SCAN = 100;

export type HistoryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly entries: readonly HistoryEntry[] }
  | { readonly kind: 'error' };

/**
 * Finished pawns the account lent on or borrowed through, newest first. The chain clears terms
 * on settle, so each pack's history rebuilds the deal; the scan covers the latest 100 packs.
 */
export function useDealHistory(accountId: string): HistoryState {
  const { network } = useNetwork();
  const [state, setState] = useState<HistoryState>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    (async () => {
      const packs = await listPacks(network, SCAN);
      const details = await Promise.all(
        packs.map((pack) => getPack(network, pack.id).catch(() => null)),
      );
      const entries: HistoryEntry[] = [];
      details.forEach((detail, i) => {
        const pack = packs[i];
        if (detail === null || pack === undefined) return;
        const deal = dealOf(network, detail);
        if (deal.outcome !== 'redeemed' && deal.outcome !== 'forfeited') return;
        const role =
          deal.lender === accountId ? 'lender' : deal.borrower === accountId ? 'borrower' : null;
        if (role !== null) entries.push({ packId: pack.id, index: pack.index, role, deal });
      });
      entries.sort((a, b) =>
        BigInt(b.deal.settledAtNs ?? '0') > BigInt(a.deal.settledAtNs ?? '0') ? 1 : -1,
      );
      return entries;
    })()
      .then((entries) => {
        if (live) setState({ kind: 'done', entries });
      })
      .catch(() => {
        if (live) setState({ kind: 'error' });
      });
    return () => {
      live = false;
    };
  }, [network, accountId]);

  return state;
}
