'use client';

import { SortAscendingIcon } from '@phosphor-icons/react';
import { useRef, useState } from 'react';

import { Segmented, SelectMenu } from '@mosaec/ui';

import { dealApr } from '../../../lib/deal';

import styles from './OfferBook.module.css';
import { OfferCard } from './OfferCard';
import { Pagination } from './Pagination';
import { useFreshBook } from './useFreshBook';

import type { Deal } from '../../../lib/deal';
import type { ReactNode } from 'react';

export interface BookEntry {
  readonly packId: string;
  readonly index: string;
  readonly deal: Deal;
  readonly offerEndsNs: string | null;
}

type Filter = 'all' | 'ZEC' | 'BTC' | 'SOL';

/** Three rows of three cards on a wide screen. */
export const OFFERS_PER_PAGE = 9;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ZEC', label: 'ZEC' },
  { id: 'BTC', label: 'BTC' },
  { id: 'SOL', label: 'SOL' },
] as const;

type Sort = 'newest' | 'apr' | 'term' | 'amount';

const SORTS = [
  { id: 'newest', label: 'Newest', hint: 'Latest listed first' },
  { id: 'apr', label: 'Highest APR', hint: 'Best yearly rate for a lender' },
  { id: 'term', label: 'Shortest term', hint: 'Money back soonest' },
  { id: 'amount', label: 'Largest loan', hint: 'Most USDC per pawn' },
] as const;

function big(value: string | null | undefined): bigint {
  return value == null ? 0n : BigInt(value);
}

function compare(sort: Sort, a: BookEntry, b: BookEntry): number {
  const desc = (x: bigint, y: bigint) => (y > x ? 1 : y < x ? -1 : 0);
  switch (sort) {
    case 'apr':
      return (dealApr(b.deal) ?? -1) - (dealApr(a.deal) ?? -1);
    case 'term':
      return -desc(big(a.deal.termNs), big(b.deal.termNs));
    case 'amount':
      return desc(big(a.deal.principal?.amount), big(b.deal.principal?.amount));
    case 'newest':
      return desc(BigInt(a.index), BigInt(b.index));
  }
}

/** Open offers with an asset filter and a sort that move in place, no page reload. */
export function OfferBook({
  entries,
  empty,
  title,
}: {
  readonly entries: readonly BookEntry[];
  readonly empty: ReactNode;
  readonly title: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const top = useRef<HTMLElement>(null);
  const book = useFreshBook(entries);
  const matching = book
    .filter(
      (entry) => filter === 'all' || entry.deal.collateral.some((line) => line.symbol === filter),
    )
    .sort((a, b) => compare(sort, a, b));
  const pages = Math.max(1, Math.ceil(matching.length / OFFERS_PER_PAGE));
  /* A refresh can shrink the book under the reader; stay on the last page that exists. */
  const current = Math.min(page, pages);
  const shown = matching.slice((current - 1) * OFFERS_PER_PAGE, current * OFFERS_PER_PAGE);
  const goTo = (next: number) => {
    setPage(next);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <section className={styles.book} ref={top}>
      <div className={styles.head}>
        {title}
        <div className={styles.controls}>
          <Segmented
            label="Collateral"
            options={FILTERS}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setPage(1);
            }}
          />
          <SelectMenu
            label="Sort"
            options={SORTS}
            value={sort}
            onChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            icon={<SortAscendingIcon size={16} />}
          />
        </div>
      </div>
      <div key={`${filter}-${sort}-${current.toString()}`} className={styles.body}>
        {shown.length === 0 ? (
          empty
        ) : (
          <div className={styles.grid}>
            {shown.map((entry) => (
              <OfferCard
                key={entry.packId}
                packId={entry.packId}
                index={entry.index}
                deal={entry.deal}
                offerEndsNs={entry.offerEndsNs}
              />
            ))}
          </div>
        )}
      </div>
      {matching.length > OFFERS_PER_PAGE && (
        <div className={styles.foot}>
          <span className="t-caption">
            {`${((current - 1) * OFFERS_PER_PAGE + 1).toString()} to ${Math.min(current * OFFERS_PER_PAGE, matching.length).toString()} of ${matching.length.toString()} offers`}
          </span>
          <Pagination page={current} pages={pages} onPage={goTo} label="Open offers" />
        </div>
      )}
    </section>
  );
}
