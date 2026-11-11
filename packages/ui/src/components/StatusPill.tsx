import { cx } from './cx';
import styles from './StatusPill.module.css';

import type { Icon } from '@phosphor-icons/react';

export type StatusTone = 'positive' | 'negative' | 'warning' | 'accent' | 'neutral' | 'inverse';

export interface StatusPillProps {
  readonly tone: StatusTone;
  readonly children: string;
  /** Glyph inside the solid badge. Without one the pill shows a live dot that breathes. */
  readonly icon?: Icon | undefined;
  /** Kept for call sites that want a plain label with no dot or badge. */
  readonly dot?: boolean;
  /** `sm` sits in lists and cards, `md` beside a page title. */
  readonly size?: 'sm' | 'md';
  readonly className?: string | undefined;
}

/**
 * The source's floating status chip ("Payment succeeded"): a white pill with a hairline border and
 * a soft drop shadow, a solid round badge in the tone colour holding a white glyph, and the label
 * in ink. Live states carry a dot with a slow halo instead of a badge.
 */
export function StatusPill({
  tone,
  children,
  icon: Glyph,
  dot = true,
  size = 'sm',
  className,
}: StatusPillProps) {
  const lead =
    Glyph !== undefined ? (
      <span className={styles.badge} aria-hidden="true">
        <Glyph weight="bold" />
      </span>
    ) : dot ? (
      <span className={styles.live} aria-hidden="true" />
    ) : null;
  return (
    <span
      className={cx(
        styles.pill,
        styles[tone],
        size === 'md' && styles.md,
        Glyph !== undefined && styles.withBadge,
        className,
      )}
    >
      {lead}
      {children}
    </span>
  );
}
