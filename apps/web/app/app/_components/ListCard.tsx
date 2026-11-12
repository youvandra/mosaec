import Link from 'next/link';

import { cx } from '@mosaec/ui';

import styles from './ListCard.module.css';

import type { ReactNode } from 'react';

/** The source's list card (Payouts › Bulk): a titled header with a status pill over divided rows. */
export function ListCard({
  title,
  pill,
  top,
  children,
  className,
}: {
  readonly title: ReactNode;
  readonly pill?: ReactNode;
  /** A band above the header, such as a row of totals. */
  readonly top?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cx(styles.card, className)}>
      {top}
      <header className={cx(styles.header, top !== undefined && styles.headerRuled)}>
        <span className="t-h5">{title}</span>
        {pill}
      </header>
      <ul className={styles.rows}>{children}</ul>
    </section>
  );
}

/** A soft pill with a dot, as in "41 of 42 sent". */
export function SoftPill({
  tone = 'positive',
  children,
}: {
  readonly tone?: 'positive' | 'accent' | 'negative' | 'neutral' | 'warning';
  readonly children: ReactNode;
}) {
  return (
    <span className={cx(styles.pill, styles[tone])}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}

export function ListRow({
  icon,
  title,
  meta,
  value,
  valueNote,
  href,
  trailing,
  rowKey,
}: {
  /** Identity of the row's content, so a live list can mark rows that changed. */
  readonly rowKey?: string;
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly value?: ReactNode;
  readonly valueNote?: ReactNode;
  readonly href?: string | undefined;
  readonly trailing?: ReactNode;
}) {
  const body = (
    <>
      {icon}
      <span className={styles.meta}>
        <span className={styles.title}>{title}</span>
        {meta !== undefined && <span className="t-caption">{meta}</span>}
      </span>
      {(value !== undefined || valueNote !== undefined) && (
        <span className={styles.value}>
          {value !== undefined && <span className={styles.amount}>{value}</span>}
          {valueNote !== undefined && <span className="t-caption">{valueNote}</span>}
        </span>
      )}
      {trailing !== undefined && <span className={styles.trailing}>{trailing}</span>}
    </>
  );
  return (
    <li className={styles.item} data-row={rowKey}>
      {href === undefined ? (
        <div className={styles.row}>{body}</div>
      ) : (
        <Link href={href} className={cx(styles.row, styles.link)}>
          {body}
        </Link>
      )}
    </li>
  );
}
