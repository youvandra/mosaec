import { cx } from './cx';
import styles from './FilterPill.module.css';

import type { ComponentPropsWithoutRef } from 'react';

export interface FilterPillProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  readonly active?: boolean;
  readonly tone?: 'default' | 'light';
  readonly children: string;
}

/** Toggle pill for filters and tab switches. */
export function FilterPill({
  active = false,
  tone = 'default',
  className,
  children,
  ...rest
}: FilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(styles.pill, tone === 'light' && styles.light, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
