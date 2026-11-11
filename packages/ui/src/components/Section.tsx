import { cx } from './cx';
import styles from './Section.module.css';

import type { ReactNode } from 'react';

export function Section({
  id,
  className,
  children,
  label,
}: {
  readonly id?: string;
  readonly className?: string | undefined;
  readonly children: ReactNode;
  readonly label?: string;
}) {
  return (
    <section id={id} className={cx(styles.section, className)} aria-label={label}>
      <div className={styles.container}>{children}</div>
    </section>
  );
}

export function SectionHeader({
  align = 'start',
  layout = 'stack',
  className,
  children,
}: {
  readonly align?: 'start' | 'center';
  readonly layout?: 'stack' | 'split';
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cx(
        styles.header,
        align === 'center' && styles.center,
        layout === 'split' && styles.split,
        className,
      )}
    >
      {children}
    </div>
  );
}
