import { cx } from '@mosaec/ui';

import styles from './PageHeader.module.css';

import type { ReactNode } from 'react';

/** Display heading in the landing's voice: one ink line and one accent line. */
export function PageHeader({
  title,
  accent,
  lead,
  eyebrow,
  actions,
}: {
  readonly title: string;
  readonly accent?: string;
  readonly lead?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.copy}>
        {eyebrow}
        <h1 className={cx('t-h1', styles.title)}>
          {title}
          {accent !== undefined && (
            <>
              {' '}
              <span className="t-accent">{accent}</span>
            </>
          )}
        </h1>
        {lead !== undefined && <p className={cx('t-body-lg', styles.lead)}>{lead}</p>}
      </div>
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

/** A section in the source's voice: numbered tag, heading on the left, lead or controls right. */
export function PageSection({
  title,
  label,
  tag,
  lead,
  aside,
  children,
}: {
  /** Heading under the tag; leave it out when the tag already names the section. */
  readonly title?: string;
  /** Accessible name of a section without a heading. */
  readonly label?: string;
  readonly tag?: ReactNode;
  readonly lead?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={title === undefined ? label : undefined}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitle}>
          {tag}
          {title !== undefined && <h2 className="t-h2">{title}</h2>}
        </div>
        {lead !== undefined && <p className={cx('t-body', styles.sectionLead)}>{lead}</p>}
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The numbered tag and heading of a section, for sections that lay out their own head. */
export function SectionTitle({
  tag,
  title,
}: {
  readonly tag?: ReactNode;
  readonly title?: string;
}) {
  return (
    <div className={styles.sectionTitle}>
      {tag}
      {title !== undefined && <h2 className="t-h2">{title}</h2>}
    </div>
  );
}
