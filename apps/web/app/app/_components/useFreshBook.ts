'use client';

import { useEffect, useState } from 'react';

import { getPack } from '../../../lib/api';
import { liveDealOf } from '../../../lib/deal';
import { useChainVersion } from '../../../lib/near/chain-change';
import { confirmingPacks, onConfirmingChange } from '../../../lib/near/confirming';
import { useNetwork } from '../../../lib/near/network';

import type { BookEntry } from './OfferBook';

interface Patch {
  /** Offers on chain the read model has not listed yet. */
  readonly added: readonly BookEntry[];
  /** Listed offers the chain already filled or cancelled. */
  readonly gone: ReadonlySet<string>;
}

const NONE: Patch = { added: [], gone: new Set() };

/**
 * The open offers as the chain holds them for packs this person just acted on. The book comes
 * from the read model, which trails the chain by up to a minute; a new offer shows at once and a
 * filled or cancelled one leaves at once instead of waiting for it.
 */
export function useFreshBook(entries: readonly BookEntry[]): readonly BookEntry[] {
  const { network } = useNetwork();
  const chainVersion = useChainVersion();
  const [patch, setPatch] = useState<Patch>(NONE);
  const [marks, setMarks] = useState(0);
  const listed = entries.map((entry) => entry.packId).join('|');

  useEffect(
    () =>
      onConfirmingChange(() => {
        setMarks((current) => current + 1);
      }),
    [],
  );

  useEffect(() => {
    const packs = confirmingPacks();
    if (packs.length === 0) {
      setPatch(NONE);
      return;
    }
    let live = true;
    const inBook = new Set(listed === '' ? [] : listed.split('|'));
    Promise.all(packs.map((pack) => getPack(network, pack).catch(() => null)))
      .then((details) => {
        if (!live) return;
        const added: BookEntry[] = [];
        const gone = new Set<string>();
        for (const pack of details) {
          if (pack === null) continue;
          const open = pack.state === 'offered';
          if (open && !inBook.has(pack.id)) {
            added.push({
              packId: pack.id,
              index: pack.index,
              deal: liveDealOf(pack),
              offerEndsNs: pack.offer?.expiresAtNs ?? null,
            });
          } else if (!open && inBook.has(pack.id)) {
            gone.add(pack.id);
          }
        }
        setPatch({ added, gone });
      })
      .catch(() => {
        if (live) setPatch(NONE);
      });
    return () => {
      live = false;
    };
  }, [network, listed, chainVersion, marks]);

  if (patch.added.length === 0 && patch.gone.size === 0) return entries;
  return [...patch.added, ...entries.filter((entry) => !patch.gone.has(entry.packId))];
}
