'use client';

import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

import { cx } from '@mosaec/ui';

import styles from './Pagination.module.css';

/** Page numbers to show: the first, the last, and the current one with a neighbour each side. */
export function pageList(current: number, total: number): readonly (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((page, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && page - previous > 1) out.push('gap');
    out.push(page);
  });
  return out;
}

/** Previous, page numbers, next. Renders nothing for a single page. */
export function Pagination({
  page,
  pages,
  onPage,
  label,
}: {
  readonly page: number;
  readonly pages: number;
  readonly onPage: (page: number) => void;
  /** What is being paged, for screen readers, such as "Open offers". */
  readonly label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className={styles.nav} aria-label={`${label} pages`}>
      <button
        type="button"
        className={styles.step}
        disabled={page === 1}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        <CaretLeftIcon size={14} weight="bold" />
        Previous
      </button>
      <ol className={styles.pages}>
        {pageList(page, pages).map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i.toString()}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={cx(styles.page, item === page && styles.current)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${item.toString()}`}
                onClick={() => {
                  onPage(item);
                }}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <button
        type="button"
        className={styles.step}
        disabled={page === pages}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        Next
        <CaretRightIcon size={14} weight="bold" />
      </button>
    </nav>
  );
}
