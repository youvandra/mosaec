import styles from './PageHeader.module.css';

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  lead,
  actions,
}: {
  readonly title: string;
  readonly lead?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.copy}>
        <h1 className="t-h2">{title}</h1>
        {lead !== undefined && <p className="t-body">{lead}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PageSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 className="t-h4">{title}</h2>
      {children}
    </section>
  );
}
