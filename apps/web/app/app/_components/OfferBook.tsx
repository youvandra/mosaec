'use client';

import { SortAscendingIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Segmented, SelectMenu } from '@mosaec/ui';

import { dealApr } from '../../../lib/deal';

import styles from './OfferBook.module.css';
import { OfferCard } from './OfferCard';

import type { Deal } from '../../../lib/deal';
import type { ReactNode } from 'react';

export interface BookEntry {
  readonly packId: string;
  readonly index: string;
  readonly deal: Deal;
  readonly offerEndsNs: string | null;
}

type Filter = 'all' | 'ZEC' | 'BTC' | 'SOL';

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
  const shown = entries
    .filter(
      (entry) => filter === 'all' || entry.deal.collateral.some((line) => line.symbol === filter),
    )
    .sort((a, b) => compare(sort, a, b));
  return (
    <section className={styles.book}>
      <div className={styles.head}>
        {title}
        <div className={styles.controls}>
          <Segmented label="Collateral" options={FILTERS} value={filter} onChange={setFilter} />
          <SelectMenu
            label="Sort"
            options={SORTS}
            value={sort}
            onChange={setSort}
            icon={<SortAscendingIcon size={16} />}
          />
        </div>
      </div>
      <div key={`${filter}-${sort}`} className={styles.body}>
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
    </section>
  );
}
