import { PlusIcon } from '@phosphor-icons/react/dist/ssr';

import { cx } from './cx';
import styles from './FaqItem.module.css';

import type { ReactNode } from 'react';

export interface FaqItemProps {
  readonly question: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}

/** Accordion row built on `details`, so it works without JavaScript. */
export function FaqItem({ question, children, defaultOpen = false }: FaqItemProps) {
  return (
    <details className={styles.item} open={defaultOpen}>
      <summary className={styles.question}>
        {question}
        <span className={styles.plus} aria-hidden="true">
          <PlusIcon size={16} />
        </span>
      </summary>
      <div className={cx('t-body', styles.answer)}>{children}</div>
    </details>
  );
}
