'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** How long a new row keeps its glow. */
const FLASH_MS = 2_400;

/**
 * Keeps a server-rendered list live: asks the server for fresh data every `everyMs` while the tab
 * is visible, and makes rows whose key is new since the last render glow once. Keys pair a pawn
 * with its outcome, so a pawn that was repaid glows too.
 */
export function LiveList({
  keys,
  everyMs = 15_000,
}: {
  readonly keys: readonly string[];
  readonly everyMs?: number;
}) {
  const router = useRouter();
  const seen = useRef<ReadonlySet<string> | null>(null);
  const signature = keys.join('|');

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [router, everyMs]);

  useEffect(() => {
    const current = new Set(signature === '' ? [] : signature.split('|'));
    const previous = seen.current;
    seen.current = current;
    if (previous === null) return;
    const timers: number[] = [];
    for (const key of current) {
      if (previous.has(key)) continue;
      const row = document.querySelector(`[data-row="${CSS.escape(key)}"]`);
      if (row === null) continue;
      row.setAttribute('data-flash', '');
      timers.push(
        window.setTimeout(() => {
          row.removeAttribute('data-flash');
        }, FLASH_MS),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [signature]);

  return null;
}
