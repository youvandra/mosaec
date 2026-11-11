import { cx } from './cx';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  readonly label: string;
  readonly valueText: string;
  /** 0 to 1. */
  readonly ratio: number;
  readonly tone?: 'accent' | 'warning' | 'positive';
}

/** Labelled bar in the style of the template's limit and budget bars. */
export function ProgressBar({ label, valueText, ratio, tone = 'accent' }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <div className={cx(styles.wrap, styles[tone])}>
      <div className={styles.head}>
        <span className="t-caption">{label}</span>
        <span className="t-caption" style={{ color: 'var(--text-primary)' }}>
          {valueText}
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
      >
        <div className={styles.fill} style={{ width: `${(clamped * 100).toString()}%` }} />
      </div>
    </div>
  );
}
