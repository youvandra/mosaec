import { ASSETS } from '@mosaec/config/assets';

import { formatCompact, formatUnits, padCents } from '../../../lib/format';

import { Activity } from './Activity';
import styles from './MarketSummary.module.css';

import type { MarketData } from '../../../lib/market';

const USDC = ASSETS.USDC;
/** Pawns shown beside the totals; the book below stays the page's main list. */
const RECENT = 4;

/** Totals stay exact to the cent until 10,000, then read as `12.5K` or `1M`. */
function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

function totals(data: MarketData) {
  const lent = data.activity
    .filter((item) => item.deal.filledAtNs !== null)
    .reduce((sum, item) => sum + BigInt(item.deal.principal?.amount ?? '0'), 0n);
  const settled = data.activity.filter(
    (item) => item.deal.outcome === 'redeemed' || item.deal.outcome === 'forfeited',
  );
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  return { open: data.offers.length, lent, settled: settled.length, repaid };
}

/** One compact card of totals beside the latest pawns, above the open book. */
export function MarketSummary({ data }: { readonly data: MarketData }) {
  const t = totals(data);
  return (
    <div className={styles.overview}>
      <section className={styles.totals} aria-label="Market totals">
        <div className={styles.metric}>
          <span className={styles.label}>Open offers</span>
          <span className={styles.value}>{t.open.toString()}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Lent so far</span>
          <span className={styles.value}>
            {cash(t.lent)}
            <span className={styles.unit}>USDC</span>
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Repaid on time</span>
          <span className={styles.value}>
            {t.settled === 0 ? '–' : `${t.repaid.toString()} of ${t.settled.toString()}`}
          </span>
          <span className={styles.bar} aria-hidden="true">
            <span
              style={{
                width: `${(t.settled === 0 ? 0 : (t.repaid / t.settled) * 100).toFixed(1)}%`,
              }}
            />
          </span>
        </div>
      </section>
      {data.activity.length > 0 && (
        <div className={styles.recent}>
          <Activity items={data.activity.slice(0, RECENT)} title="Recent pawns" />
        </div>
      )}
    </div>
  );
}
