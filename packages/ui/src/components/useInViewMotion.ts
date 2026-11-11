'use client';

import { useEffect, useRef } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Marks an element `out` while it is off screen and `in` once it enters, both ways, like the
 * design source's replaying appear effects. Server HTML carries no state, so content is visible
 * without script; a page opened in a background tab is left as rendered.
 */
export function useInViewMotion<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (window.matchMedia(REDUCED_MOTION).matches || document.visibilityState === 'hidden') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        if (entry.isIntersecting) {
          node.dataset.motion = 'in';
        } else if (node.dataset.motion !== undefined || entry.boundingClientRect.top > 0) {
          node.dataset.motion = 'out';
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  return ref;
}
