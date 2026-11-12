import { ASSETS } from '@mosaec/config/assets';
import { cx } from '@mosaec/ui';

import { formatCompact, formatUnits, padCents } from '../../../lib/format';

import { Activity } from './Activity';
import styles from './MarketSummary.module.css';

import type { DealOutcome } from '../../../lib/deal';
import type { MarketData } from '../../../lib/market';
import type { ReactNode } from 'react';

const USDC = ASSETS.USDC;
/** Pawns listed beside the totals; the open book below stays the page's main list. */
const RECENT = 4;
/** Pawns a lender filled. Open offers are in the book below; empty or cancelled packs say nothing. */
const FILLED: readonly DealOutcome[] = ['running', 'redeemed', 'forfeited'];
/** Dots per stat card: three rows of five, as in the design source's Stat Grid. */
const DOTS = 15;

/** Totals stay exact to the cent until 10,000, then read as `12.5K` or `1M`. */
function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

type Dot = 'strong' | 'soft' | 'faint';

/** A dot grid that carries data: the first `strong` dots are full blue, the next `soft` pale. */
function Dots({ strong, soft = 0 }: { readonly strong: number; readonly soft?: number }) {
  const dots: Dot[] = Array.from({ length: DOTS }, (_, i) =>
    i < strong ? 'strong' : i < strong + soft ? 'soft' : 'faint',
  );
  return (
    <span className={styles.dots} aria-hidden="true">
      {dots.map((tone, i) => (
        <span key={i} className={cx(styles.dot, styles[tone])} />
      ))}
    </span>
  );
}

function StatCard({
  value,
  unit,
  label,
  dots,
}: {
  readonly value: string;
  readonly unit?: string;
  readonly label: string;
  readonly dots: ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.copy}>
        <span className={styles.value}>
          {value}
          {unit !== undefined && <span className={styles.unit}>{unit}</span>}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
      {dots}
    </div>
  );
}

/**
 * The market's totals as two stat cards (the design source's Stat Grid), beside the latest filled
 * pawns. Each dot grid counts real pawns: repaid against settled, open offers against the grid.
 */
export function MarketSummary({ data }: { readonly data: MarketData }) {
  const filled = data.activity.filter((item) => FILLED.includes(item.deal.outcome));
  const lent = filled.reduce((sum, item) => sum + BigInt(item.deal.principal?.amount ?? '0'), 0n);
  const settled = filled.filter((item) => item.deal.outcome !== 'running');
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  const open = data.offers.length;
  const repaidLabel =
    settled.length === 0
      ? 'No pawn has reached its date yet'
      : `${repaid.toString()} of ${settled.length.toString()} repaid on time`;
  return (
    <div className={styles.frame}>
      <div className={cx(styles.overview, filled.length === 0 && styles.solo)}>
        <div className={styles.stats}>
          <StatCard
            value={lent === 0n ? filled.length.toString() : cash(lent)}
            unit={lent === 0n ? 'pawns filled' : 'USDC lent'}
            label={repaidLabel}
            dots={
              <Dots
                strong={Math.min(repaid, DOTS)}
                soft={Math.min(settled.length - repaid, DOTS)}
              />
            }
          />
          <StatCard
            value={open.toString()}
            unit={open === 1 ? 'open offer' : 'open offers'}
            label={open === 0 ? 'Every offer is filled' : 'Ready to fill now'}
            dots={<Dots strong={Math.min(open, DOTS)} />}
          />
        </div>
        {filled.length > 0 && (
          <div className={styles.recent}>
            <Activity items={filled.slice(0, RECENT)} title="Recent pawns" aside={false} />
          </div>
        )}
      </div>
    </div>
  );
}
