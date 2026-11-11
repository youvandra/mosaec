'use client';

import { useEffect, useState } from 'react';

import { getDesk } from '../../../lib/api';
import { deskStatus } from '../../../lib/desk-status';
import { useNetwork } from '../../../lib/near/network';

import type { DeskStatus } from '../../../lib/desk-status';

const POLL_MS = 60_000;

/** The desk loop's status for the sidebar badge, polled once a minute; `null` while unknown. */
export function useDeskStatus(): DeskStatus | null {
  const { network } = useNetwork();
  const [status, setStatus] = useState<DeskStatus | null>(null);

  useEffect(() => {
    let live = true;
    const check = () => {
      getDesk(network)
        .then((overview) => {
          if (live) setStatus(deskStatus(overview, Date.now()));
        })
        .catch(() => {
          if (live) setStatus('soon');
        });
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [network]);

  return status;
}
