import { cx } from './cx';
import styles from './StatusPill.module.css';

export type StatusTone = 'positive' | 'negative' | 'warning' | 'accent' | 'neutral' | 'inverse';

export interface StatusPillProps {
  readonly tone: StatusTone;
  readonly children: string;
  readonly dot?: boolean;
  readonly className?: string | undefined;
}

/** Small rounded status label with an optional leading dot. */
export function StatusPill({ tone, children, dot = true, className }: StatusPillProps) {
  return (
    <span className={cx(styles.pill, styles[tone], className)}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
