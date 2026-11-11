import {
  CalendarCheckIcon,
  ChartLineUpIcon,
  CoinsIcon,
  StorefrontIcon,
} from '@phosphor-icons/react/dist/ssr';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon } from '@mosaec/ui';

import { formatCompact, formatUnits, padCents } from '../../../lib/format';
import { SUGGESTED_MONTHLY_RATE_BPS } from '../../../lib/rates';

import { Stat, StatRow } from './Stat';

import type { MarketData } from '../../../lib/market';

const USDC = ASSETS.USDC;

/** Totals stay exact to the cent until 10,000, then read as `12.5K` or `1M`. */
function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

/** Four tiles: open offers, USDC lent, on-time share, the suggested ZEC rate. */
export function MarketStats({ data }: { readonly data: MarketData }) {
  const filled = data.activity.filter((item) => item.deal.filledAtNs !== null);
  const lent = filled.reduce(
    (sum, item) => sum + (item.deal.principal === null ? 0n : BigInt(item.deal.principal.amount)),
    0n,
  );
  const repaidValue = data.activity
    .filter((item) => item.deal.outcome === 'redeemed')
    .reduce(
      (sum, item) => sum + (item.deal.repayment === null ? 0n : BigInt(item.deal.repayment.amount)),
      0n,
    );
  const settled = data.activity.filter(
    (item) => item.deal.outcome === 'redeemed' || item.deal.outcome === 'forfeited',
  );
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  const zecRate = (SUGGESTED_MONTHLY_RATE_BPS.ZEC ?? 0) / 100;
  const open = data.offers.length;
  return (
    <StatRow>
      <Stat
        icon={
          <AppIcon color="blue" size={40}>
            <StorefrontIcon weight="fill" />
          </AppIcon>
        }
        label="Open offers"
        value={open.toString()}
        note={open === 0 ? 'Book is clear, every offer filled' : 'Ready to fill now'}
      />
      <Stat
        icon={
          <AppIcon color="green" size={40}>
            <CoinsIcon weight="fill" />
          </AppIcon>
        }
        label="Lent so far"
        value={cash(lent)}
        unit="USDC"
        note={`${cash(repaidValue)} USDC came back as repayments`}
      />
      <Stat
        icon={
          <AppIcon color="violet" size={40}>
            <CalendarCheckIcon weight="fill" />
          </AppIcon>
        }
        label="Repaid on time"
        value={`${repaid.toString()} of ${settled.length.toString()}`}
        progress={settled.length === 0 ? 0 : repaid / settled.length}
        note="Settled pawns, the rest kept their coins"
      />
      <Stat
        icon={
          <AppIcon color="orange" size={40}>
            <ChartLineUpIcon weight="fill" />
          </AppIcon>
        }
        label="ZEC rate"
        value={`${zecRate.toFixed(1)}%`}
        unit="a month"
        progress={0.5}
        tone="warning"
        note="Suggested at 50% loan to value"
      />
    </StatRow>
  );
}
