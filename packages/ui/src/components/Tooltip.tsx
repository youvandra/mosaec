import { cx } from './cx';
import styles from './Tooltip.module.css';

import type { ReactNode } from 'react';

export interface TooltipProps {
  /** The short text shown on hover and keyboard focus. */
  readonly label: string;
  readonly side?: 'top' | 'bottom';
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** A dark bubble over its child on hover or focus; the label also names the child for readers. */
export function Tooltip({ label, side = 'top', children, className }: TooltipProps) {
  return (
    <span className={cx(styles.wrap, className)} data-side={side}>
      {children}
      <span role="tooltip" className={styles.bubble}>
        {label}
      </span>
    </span>
  );
}
