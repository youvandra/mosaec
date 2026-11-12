'use client';

import { useEffect, useState } from 'react';

/**
 * A signal that the chain moved under this page: one of this person's transactions settled, and
 * again on each beat while the read model catches up. Client views that read the chain or the API
 * re-read on every beat, so nothing waits for a manual reload.
 */
const EVENT = 'mosaec:chain-change';

export function announceChainChange(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** A number that grows on every chain change; put it in an effect's dependencies to re-read. */
export function useChainVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => {
      setVersion((current) => current + 1);
    };
    window.addEventListener(EVENT, bump);
    return () => {
      window.removeEventListener(EVENT, bump);
    };
  }, []);
  return version;
}
