import { cx } from '@mosaec/ui';

import styles from './Stat.module.css';

import type { CSSProperties, ReactNode } from 'react';

/**
 * A figure card in the source's "Spaces" shape: icon tile, label, the number, a thin track and
 * one line of context.
 */
export function Stat({
  icon,
  aside,
  label,
  value,
  unit,
  note,
  progress,
  tone = 'accent',
}: {
  readonly icon: ReactNode;
  readonly aside?: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly unit?: string | undefined;
  readonly note?: ReactNode;
  /** 0 to 1; draws the track when given. */
  readonly progress?: number | undefined;
  readonly tone?: 'accent' | 'positive' | 'warning' | 'negative';
}) {
  const fill = {
    '--fill': `${Math.round(Math.min(Math.max(progress ?? 0, 0), 1) * 100).toString()}%`,
  } as CSSProperties;
  return (
    <div className={styles.stat}>
      <div className={styles.top}>
        {icon}
        {aside}
      </div>
      <div className={styles.body}>
        <span className={cx('t-body-sm', styles.label)}>{label}</span>
        <span className={styles.figure}>
          <span className={styles.value}>{value}</span>
          {unit !== undefined && <span className={styles.unit}>{unit}</span>}
        </span>
      </div>
      {progress !== undefined && (
        <span className={cx(styles.track, styles[tone])} style={fill} aria-hidden="true">
          <span />
        </span>
      )}
      {note !== undefined && <span className="t-caption">{note}</span>}
    </div>
  );
}

export function StatRow({
  children,
  fit = false,
}: {
  readonly children: ReactNode;
  /** Cards share the row evenly however many there are, instead of four fixed columns. */
  readonly fit?: boolean;
}) {
  return <div className={cx(styles.row, fit && styles.fit)}>{children}</div>;
}
