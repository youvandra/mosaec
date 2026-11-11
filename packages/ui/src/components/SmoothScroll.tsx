'use client';

import { useEffect } from 'react';

/** Per-second follow rate; the design source runs its scroll at intensity 40 (about 7.4). */
const FOLLOW_RATE = 7.4;
const SETTLE_PX = 0.35;
const MAX_STEP = 1 / 30;
const LATCH_MS = 150;
const HANDHELD = /Android.+Mobile|iPhone|iPod|BlackBerry|webOS|Windows Phone/i;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** An element on the wheel's path that should keep the gesture, such as a scrollable panel. */
function innerScroller(path: EventTarget[], dy: number): Element | null {
  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue;
    if (target === document.documentElement || target === document.body) return null;
    if (target.hasAttribute('data-native-scroll')) return target;
    if (target.scrollHeight - target.clientHeight < 1) continue;
    const style = getComputedStyle(target);
    if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) continue;
    const canMove =
      dy > 0
        ? target.scrollTop < target.scrollHeight - target.clientHeight - 1
        : target.scrollTop > 1;
    if (canMove) return target;
    if (style.overscrollBehaviorY === 'contain' || style.overscrollBehaviorY === 'none') {
      return target;
    }
  }
  return null;
}

/**
 * Eases wheel scrolling on desktop and glides same-page anchor links, ported from the design
 * source's smooth scroll. Touch devices, keyboard, scrollbar drags and reduced motion stay native.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (matchMedia('(max-width: 767px)').matches || HANDHELD.test(navigator.userAgent)) return;

    const root = document.documentElement;
    let pos = window.scrollY;
    let goal = pos;
    let raf = 0;
    let last = 0;
    let latchEl: Element | null = null;
    let latchAt = -Infinity;
    let writing = false;

    const max = () => Math.max(0, root.scrollHeight - window.innerHeight);
    const locked = () =>
      getComputedStyle(document.body).overflow === 'hidden' ||
      getComputedStyle(root).overflow === 'hidden';

    const write = (y: number) => {
      writing = true;
      window.scrollTo({ top: y, behavior: 'instant' });
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };
    const loop = (now: number) => {
      if (reduced.matches || locked()) {
        stop();
        pos = goal = window.scrollY;
        return;
      }
      const dt = last ? clamp((now - last) / 1000, 0, MAX_STEP) : 1 / 60;
      last = now;
      pos += (goal - pos) * (1 - Math.exp(-FOLLOW_RATE * dt));
      if (Math.abs(goal - pos) < SETTLE_PX) pos = goal;
      write(pos);
      if (pos !== goal) raf = requestAnimationFrame(loop);
      else stop();
    };
    const glideTo = (y: number) => {
      if (reduced.matches) {
        stop();
        pos = goal = y;
        write(y);
        return;
      }
      if (!raf) pos = window.scrollY;
      goal = clamp(y, 0, max());
      if (pos !== goal && !raf) raf = requestAnimationFrame(loop);
    };

    const onWheel = (event: WheelEvent) => {
      if (reduced.matches || event.ctrlKey || !event.cancelable || locked()) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const dy = event.deltaY * scale;
      if (dy === 0) return;
      const path = event.composedPath();
      const continuing =
        event.timeStamp - latchAt < LATCH_MS && (latchEl === null || path.includes(latchEl));
      const inner = continuing ? latchEl : innerScroller(path, dy);
      latchEl = inner;
      latchAt = event.timeStamp;
      if (inner !== null) return;
      event.preventDefault();
      glideTo((raf ? goal : window.scrollY) + dy);
    };

    const onScroll = () => {
      if (writing) {
        writing = false;
        return;
      }
      if (!raf) pos = goal = window.scrollY;
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = (event.target as Element | null)?.closest('a[href*="#"]');
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash === '') {
        return;
      }
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target === null) return;
      event.preventDefault();
      const padding = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      glideTo(target.getBoundingClientRect().top + window.scrollY - padding);
      history.pushState(null, '', url.hash);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    return () => {
      stop();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return null;
}
