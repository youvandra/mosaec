import styles from './Panel.module.css';

import type { ReactNode } from 'react';

export function Panel({
  title,
  aside,
  children,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className="t-h5">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Facts({ rows }: { readonly rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.row}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
