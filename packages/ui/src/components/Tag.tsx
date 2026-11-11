import { cx } from './cx';
import styles from './Tag.module.css';

import type { ReactNode } from 'react';

export interface TagProps {
  /** Text in the blue badge, such as a section number. */
  readonly badge?: string;
  /** Small illustrative glyph after the badge text. */
  readonly shape?: ReactNode;
  readonly children: string;
  readonly tone?: 'default' | 'inverse';
  readonly className?: string | undefined;
}

/** Section eyebrow: a blue badge plus a white label pill. */
export function Tag({ badge, shape, children, tone = 'default', className }: TagProps) {
  return (
    <span className={cx(styles.tag, tone === 'inverse' && styles.inverse, className)}>
      {(badge !== undefined || shape !== undefined) && (
        <span className={styles.badge}>
          {badge}
          {shape !== undefined && (
            <span className={styles.shape} aria-hidden="true">
              {shape}
            </span>
          )}
        </span>
      )}
      <span className={styles.label}>{children}</span>
    </span>
  );
}
