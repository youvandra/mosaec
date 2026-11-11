'use client';

import { useEffect, useState } from 'react';

import styles from './HowItWorks.module.css';

export interface TourStep {
  readonly id: string;
  readonly label: string;
}

/** Side navigation whose active item follows the card nearest the middle of the screen. */
export function TourNav({ steps }: { readonly steps: readonly TourStep[] }) {
  const [active, setActive] = useState(steps[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible !== undefined) {
          setActive(visible.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const step of steps) {
      const node = document.getElementById(step.id);
      if (node !== null) observer.observe(node);
    }
    return () => {
      observer.disconnect();
    };
  }, [steps]);

  return (
    <nav className={styles.nav} aria-label="Steps">
      {steps.map((step, index) => (
        <a
          key={step.id}
          href={`#${step.id}`}
          className={styles.navItem}
          aria-current={active === step.id ? 'step' : undefined}
        >
          <span className={styles.navIndex}>{String(index + 1).padStart(2, '0')}</span>
          {step.label}
        </a>
      ))}
    </nav>
  );
}
