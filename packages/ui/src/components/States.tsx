import { cx } from './cx';
import styles from './States.module.css';

import type { CSSProperties, ReactNode } from 'react';

interface StateProps {
  readonly title: string;
  readonly children?: ReactNode;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
}

/** Shown where a list or page has nothing yet, with the next step. */
export function EmptyState({ title, children, icon, action }: StateProps) {
  return (
    <div className={styles.state}>
      {icon !== undefined && <span className={styles.icon}>{icon}</span>}
      <h3 className="t-h5">{title}</h3>
      {children !== undefined && <p className="t-body-sm">{children}</p>}
      {action !== undefined && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

/** Shown where loading failed, in plain words and with a way forward. */
export function ErrorState({ title, children, icon, action }: StateProps) {
  return (
    <div className={cx(styles.state, styles.error)} role="alert">
      {icon !== undefined && <span className={styles.icon}>{icon}</span>}
      <h3 className="t-h5">{title}</h3>
      {children !== undefined && <p className="t-body-sm">{children}</p>}
      {action !== undefined && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

/** Placeholder block while content loads. */
export function Skeleton({
  width = '100%',
  height = 16,
}: {
  readonly width?: CSSProperties['width'];
  readonly height?: CSSProperties['height'];
}) {
  return (
    <span
      className={styles.skeleton}
      style={{ display: 'block', width, height }}
      aria-hidden="true"
    />
  );
}
