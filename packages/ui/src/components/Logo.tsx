import { cx } from './cx';
import { LobedMark } from './LobedMark';
import styles from './Logo.module.css';

import type { CSSProperties } from 'react';

export interface LogoProps {
  /** `mark` shows the mark only. */
  readonly variant?: 'mark' | 'full';
  /**
   * The surface it sits on. `dark` (default) is ink on a light page; `light` is white for dark
   * surfaces.
   */
  readonly tone?: 'dark' | 'light';
  /** Brand box in px; the mark is drawn across most of it. Leave unset: every logo uses LOGO_SIZE. */
  readonly size?: number;
  readonly className?: string | undefined;
  /** Builds the mark lobe by lobe on hover even outside a link. */
  readonly interactive?: boolean;
}

/** One brand size everywhere: navigation, app sidebar, phone bar, footer, loader. */
export const LOGO_SIZE = 44;

/**
 * The Mosaec mark, with the wordmark in the full variant. On hover its four lobes rise one by
 * one, smallest first. Mark and wordmark scale from one size, so every size keeps its proportions.
 */
export function Logo({
  variant = 'full',
  tone = 'dark',
  size = LOGO_SIZE,
  className,
  interactive = false,
}: LogoProps) {
  return (
    <span
      className={cx(
        styles.logo,
        tone === 'light' && styles.light,
        interactive && styles.interactive,
        className,
      )}
      style={{ '--logo-size': `${size.toString()}px` } as CSSProperties}
    >
      <span className={styles.box}>
        <LobedMark className={styles.mark} />
      </span>
      {variant === 'full' ? (
        <span className={styles.word}>Mosaec</span>
      ) : (
        <span className="sr-only">Mosaec</span>
      )}
    </span>
  );
}
