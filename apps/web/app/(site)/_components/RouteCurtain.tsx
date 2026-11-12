'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LobedMark } from '@mosaec/ui';

import styles from './RouteCurtain.module.css';

/** Shortest time the curtain stays down, so a fast page change still reads as one motion. */
const MIN_MS = 650;
/** The curtain always lifts by then, whether or not the next page has arrived. */
const MAX_MS = 3000;

type Phase = 'idle' | 'cover' | 'lift';

function internalTarget(event: MouseEvent, pathname: string): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest('a');
  if (anchor === null || anchor === undefined) return false;
  if (anchor.target !== '' && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  /* Same page (an anchor glide) and the app, which has its own shell, keep their own motion. */
  if (url.pathname === pathname) return false;
  return !url.pathname.startsWith('/app');
}

/**
 * The page loader's curtain between public pages: it drops on a link click, holds the mark and
 * the track while the next page loads, and lifts once that page is in. It never waits longer than
 * MAX_MS, and it stays off when motion is reduced.
 */
export function RouteCurtain() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const startedAt = useRef(0);
  const from = useRef(pathname);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((id) => {
      window.clearTimeout(id);
    });
    timers.current = [];
  };

  const lift = () => {
    clear();
    setPhase('lift');
    timers.current.push(
      window.setTimeout(() => {
        setPhase('idle');
      }, 450),
    );
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!document.documentElement.classList.contains('motion-ok')) return;
      if (!internalTarget(event, window.location.pathname)) return;
      clear();
      from.current = window.location.pathname;
      startedAt.current = performance.now();
      setPhase('cover');
      timers.current.push(window.setTimeout(lift, MAX_MS));
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clear();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'cover' || pathname === from.current) return;
    const wait = Math.max(0, MIN_MS - (performance.now() - startedAt.current));
    clear();
    timers.current.push(window.setTimeout(lift, wait));
  }, [pathname, phase]);

  if (phase === 'idle') return null;
  return (
    <div className={styles.curtain} data-phase={phase} aria-hidden="true">
      <span className={styles.mark}>
        <LobedMark />
      </span>
      <span className={styles.track}>
        <span className={styles.progress} />
      </span>
    </div>
  );
}
