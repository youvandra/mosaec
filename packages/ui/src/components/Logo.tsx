import { cx } from './cx';
import styles from './Logo.module.css';
import { Mark } from './Mark';

import type { CSSProperties } from 'react';

export interface LogoProps {
  /** `mark` shows the badge only. */
  readonly variant?: 'mark' | 'full';
  /**
   * The surface it sits on. `dark` (default) is ink on a light page: ink badge, white mark, ink
   * wordmark. `light` is for dark surfaces: white badge, ink mark, white wordmark.
   */
  readonly tone?: 'dark' | 'light';
  /** Badge diameter in px. Leave unset: every brand logo on the site and app is LOGO_SIZE. */
  readonly size?: number;
  readonly className?: string | undefined;
  /** Rotates the mark on hover even outside a link. */
  readonly interactive?: boolean;
}

/** One badge size for the brand everywhere: navigation, app sidebar, phone bar, footer, loader. */
export const LOGO_SIZE = 44;

/**
 * The Mosaec mark in a round badge, with the wordmark in the full variant. The mark is always 60%
 * of the badge width and the wordmark half the badge, so every size keeps the same proportions.
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
      <span className={styles.badge}>
        <Mark className={styles.mark} />
      </span>
      {variant === 'full' ? (
        <span className={styles.word}>Mosaec</span>
      ) : (
        <span className="sr-only">Mosaec</span>
      )}
    </span>
  );
}
