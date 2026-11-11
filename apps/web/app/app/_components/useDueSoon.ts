'use client';

import { useEffect, useState } from 'react';

import { getPositions } from '../../../lib/api';
import { useNetwork } from '../../../lib/near/network';
import { useWallet } from '../../../lib/near/wallet';

/** A borrowed pawn is "due soon" inside the last three days of its term. */
export const DUE_SOON_MS = 3 * 86_400_000;
const POLL_MS = 120_000;
const NS_PER_MS = 1_000_000n;

export interface DueSoon {
  readonly count: number;
  /** Earliest due date among them, in nanoseconds. */
  readonly firstNs: string | null;
}

/** Ticket-side pawns of the connected account that end within three days and are not past due. */
export function useDueSoon(): DueSoon {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const [due, setDue] = useState<DueSoon>({ count: 0, firstNs: null });

  useEffect(() => {
    setDue({ count: 0, firstNs: null });
    if (accountId === null) return;
    let live = true;
    const check = () => {
      getPositions(network, accountId)
        .then((positions) => {
          if (!live) return;
          const now = BigInt(Date.now()) * NS_PER_MS;
          const limit = now + BigInt(DUE_SOON_MS) * NS_PER_MS;
          const dates = positions.borrowing
            .map((pack) => pack.terms?.expiresAtNs ?? null)
            .filter((ns): ns is string => ns !== null && BigInt(ns) > now && BigInt(ns) <= limit)
            .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
          setDue({ count: dates.length, firstNs: dates[0] ?? null });
        })
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [network, accountId]);

  return due;
}
