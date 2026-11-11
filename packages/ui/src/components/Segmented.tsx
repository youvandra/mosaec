'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cx } from './cx';
import styles from './Segmented.module.css';

import type { CSSProperties, ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

/**
 * A segmented control with one pill that slides to the chosen option (the source's Filter Pill
 * and Segmented, with the move animated instead of swapped).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = 'light',
  size = 'md',
}: {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
  /** `light`: white pill on grey. `ink`: ink pill on grey. */
  readonly tone?: 'light' | 'ink';
  readonly size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (root === null) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>('[aria-checked="true"]');
      setBox(active === null ? null : { left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [value]);

  const style =
    box === null
      ? undefined
      : ({
          '--seg-left': `${box.left.toString()}px`,
          '--seg-width': `${box.width.toString()}px`,
        } as CSSProperties);

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cx(styles.group, styles[tone], styles[size])}
      style={style}
    >
      {box !== null && <span className={styles.pill} aria-hidden="true" />}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          disabled={option.disabled}
          className={styles.option}
          onClick={() => {
            onChange(option.id);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
