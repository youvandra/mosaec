'use client';

import { HourglassMediumIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { explorerTxUrl } from '@mosaec/config/networks';
import { StatusPill, Tooltip } from '@mosaec/ui';

import { clearConfirming, confirmingOf, onConfirmingChange } from '../../../../lib/near/confirming';
import { useNetwork } from '../../../../lib/near/network';

import type { Confirming } from '../../../../lib/near/confirming';

const POLL_MS = 4_000;

/**
 * Shown beside the status while this browser's last transaction on the pack is not in the
 * indexed history yet; the page refreshes itself until it is, then the pill goes away.
 */
export function ConfirmingPill({
  pack,
  hashes,
}: {
  readonly pack: string;
  readonly hashes: readonly string[];
}) {
  const router = useRouter();
  const { network } = useNetwork();
  const [entry, setEntry] = useState<Confirming | null>(null);

  useEffect(() => {
    const sync = () => {
      const current = confirmingOf(pack);
      if (current !== null && hashes.includes(current.hash)) {
        clearConfirming(pack);
        setEntry(null);
        return;
      }
      setEntry(current);
    };
    sync();
    return onConfirmingChange(sync);
  }, [pack, hashes]);

  useEffect(() => {
    if (entry === null) return;
    const timer = window.setInterval(() => {
      if (confirmingOf(pack) === null) {
        setEntry(null);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [entry, pack, router]);

  if (entry === null) return null;
  return (
    <Tooltip label="Your transaction is final on chain. The page updates as soon as it is indexed.">
      <a href={explorerTxUrl(network, entry.hash)} target="_blank" rel="noreferrer">
        <StatusPill tone="accent" icon={HourglassMediumIcon} size="md">
          Confirming
        </StatusPill>
      </a>
    </Tooltip>
  );
}
