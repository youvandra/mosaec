'use client';

import { useEffect, useRef } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** Default visible share that plays the entrance. */
const ENTER_RATIO = 0.15;

/**
 * Marks an element `in` once enough of it is on screen, and `out` again only after it has fully
 * left through the bottom edge, so it replays on the next scroll down. The `out` state moves the
 * element further down, away from the viewport, which keeps the observer from flipping it back
 * and forth at the edge. Elements that leave through the top stay `in`. Server HTML carries no
 * state, so content is visible without script; a page opened in a background tab is left as
 * rendered.
 */
export function useInViewMotion<T extends HTMLElement>(enterRatio = ENTER_RATIO) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (window.matchMedia(REDUCED_MOTION).matches || document.visibilityState === 'hidden') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        const below = entry.boundingClientRect.top > (entry.rootBounds?.bottom ?? innerHeight) - 1;
        if (entry.intersectionRatio >= enterRatio) {
          node.dataset.motion = 'in';
        } else if (!entry.isIntersecting && below) {
          node.dataset.motion = 'out';
        }
      },
      { threshold: [0, enterRatio] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [enterRatio]);

  return ref;
}
