import { ASSETS } from '@mosaec/config/assets';

import { formatCompact, formatUnits, padCents } from '../../../lib/format';

import { Activity } from './Activity';
import { LiveList } from './LiveList';
import styles from './MarketSummary.module.css';

import type { DealOutcome } from '../../../lib/deal';
import type { MarketData } from '../../../lib/market';

const USDC = ASSETS.USDC;
/** Pawns listed under the totals; the open book below stays the page's main list. */
const RECENT = 4;
/** Pawns a lender filled. Open offers are in the book below; empty or cancelled packs say nothing. */
const FILLED: readonly DealOutcome[] = ['running', 'redeemed', 'forfeited'];

/** Whole dollars until 10,000, then `12.5K` or `1M`. */
function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

/**
 * One card: the book's totals as a row of figures (the design source's Stats row) over the latest
 * filled pawns. The list stays live and new rows glow once.
 */
export function MarketSummary({ data }: { readonly data: MarketData }) {
  const filled = data.activity.filter((item) => FILLED.includes(item.deal.outcome));
  const lent = filled.reduce((sum, item) => sum + BigInt(item.deal.principal?.amount ?? '0'), 0n);
  const settled = filled.filter((item) => item.deal.outcome !== 'running');
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  const recent = filled.slice(0, RECENT);
  const stats = [
    { value: data.offers.length.toString(), label: 'Open offers' },
    { value: lent === 0n ? '–' : cash(lent), unit: 'USDC', label: 'Lent so far' },
    {
      value: settled.length === 0 ? '–' : `${repaid.toString()}/${settled.length.toString()}`,
      label: 'Repaid on time',
    },
  ];
  const band = (
    <dl className={styles.stats}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.stat}>
          <dt>{stat.label}</dt>
          <dd>
            {stat.value}
            {stat.unit !== undefined && stat.value !== '–' && (
              <span className={styles.unit}>{stat.unit}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <>
      <LiveList keys={recent.map((item) => `${item.packId}:${item.deal.outcome}`)} />
      {recent.length === 0 ? (
        <section className={styles.solo}>{band}</section>
      ) : (
        <Activity items={recent} title="Recent pawns" aside={false} top={band} />
      )}
    </>
  );
}
