import { ASSETS } from '@mosaec/config/assets';

import { formatCompact, formatUnits, padCents } from '../../../lib/format';

import { Activity } from './Activity';
import styles from './MarketSummary.module.css';

import type { DealOutcome } from '../../../lib/deal';
import type { MarketData } from '../../../lib/market';

const USDC = ASSETS.USDC;
/** Pawns shown above the book; the open offers below stay the page's main list. */
const RECENT = 4;
/** Pawns a lender filled. Open offers are listed below, and empty or cancelled packs say nothing. */
const FILLED: readonly DealOutcome[] = ['running', 'redeemed', 'forfeited'];

/** Totals stay exact to the cent until 10,000, then read as `12.5K` or `1M`. */
function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

/** The latest filled pawns in one card, with the book's totals in its header. */
export function MarketSummary({ data }: { readonly data: MarketData }) {
  const filled = data.activity.filter((item) => FILLED.includes(item.deal.outcome));
  if (filled.length === 0) return null;
  const lent = filled.reduce((sum, item) => sum + BigInt(item.deal.principal?.amount ?? '0'), 0n);
  const settled = filled.filter((item) => item.deal.outcome !== 'running');
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  const totals = [
    { value: `${cash(lent)} USDC`, label: 'lent' },
    ...(settled.length === 0
      ? []
      : [{ value: `${repaid.toString()} of ${settled.length.toString()}`, label: 'repaid' }]),
  ];
  return (
    <Activity
      items={filled.slice(0, RECENT)}
      title="Recent pawns"
      aside={
        <dl className={styles.totals}>
          {totals.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      }
    />
  );
}
