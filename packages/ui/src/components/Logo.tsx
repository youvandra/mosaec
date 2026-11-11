import { cx } from './cx';
import styles from './Logo.module.css';

export interface LogoProps {
  /** `mark` shows the badge only. */
  readonly variant?: 'mark' | 'full';
  readonly tone?: 'dark' | 'light';
  /** Badge diameter in px. */
  readonly size?: number;
  readonly className?: string | undefined;
  /** Rotates the mark on hover even outside a link. */
  readonly interactive?: boolean;
}

const MARK_WHITE = '/brand/mark-white.png';
const MARK_BLACK = '/brand/mark-black.png';

/** The Mosaec mark in a round badge, with the wordmark in the full variant. */
export function Logo({
  variant = 'full',
  tone = 'dark',
  size = 44,
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
    >
      <span className={styles.badge} style={{ width: size, height: size }}>
        <img src={tone === 'light' ? MARK_BLACK : MARK_WHITE} alt="" width={512} height={376} />
      </span>
      {variant === 'full' ? (
        <span className={styles.word}>Mosaec</span>
      ) : (
        <span className="sr-only">Mosaec</span>
      )}
    </span>
  );
}
