import { Tag, cx } from '@mosaec/ui';

import styles from './LegalPage.module.css';

import type { ReactNode } from 'react';

export interface LegalSection {
  readonly title: string;
  readonly body: ReactNode;
}

/** A plain reading page: tag, title, date, then numbered sections in one column. */
export function LegalPage({
  tag,
  title,
  updated,
  lead,
  sections,
}: {
  readonly tag: string;
  readonly title: string;
  readonly updated: string;
  readonly lead: ReactNode;
  readonly sections: readonly LegalSection[];
}) {
  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <Tag badge="Legal">{tag}</Tag>
        <h1 className="t-h1">{title}</h1>
        <p className={cx('t-caption', styles.updated)}>Last updated {updated}</p>
        <div className={cx('t-body-lg', styles.lead)}>{lead}</div>
      </header>
      <ol className={styles.sections}>
        {sections.map((section, i) => (
          <li key={section.title} id={`s${(i + 1).toString()}`} className={styles.section}>
            <h2 className="t-h4">
              <span className={styles.num}>{(i + 1).toString().padStart(2, '0')}</span>
              {section.title}
            </h2>
            <div className={cx('t-body', styles.body)}>{section.body}</div>
          </li>
        ))}
      </ol>
    </article>
  );
}
