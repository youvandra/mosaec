import {
  CalendarCheckIcon,
  CoinsIcon,
  SealCheckIcon,
  StorefrontIcon,
} from '@phosphor-icons/react/dist/ssr';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon, Tag } from '@mosaec/ui';

import { formatCompact, formatUnits, padCents } from '../../../lib/format';

import { Activity } from './Activity';
import { SoftPill } from './ListCard';
import { LiveList } from './LiveList';
import styles from './MarketSummary.module.css';
import { PageSection } from './PageHeader';

import type { ActivityItem } from './Activity';
import type { DealOutcome } from '../../../lib/deal';
import type { MarketData } from '../../../lib/market';
import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

const USDC = ASSETS.USDC;
/** Pawns listed under the book; the open offers stay the page's main list. */
const RECENT = 6;
/** Pawns a lender filled. Open offers are in the book; empty or cancelled packs say nothing. */
const FILLED: readonly DealOutcome[] = ['running', 'redeemed', 'forfeited'];

/** Exact to the cent until 10,000, then `12.5K` or `1M`. */
function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

export interface MarketFigures {
  readonly open: number;
  readonly lent: bigint;
  readonly repaid: number;
  readonly settled: number;
  readonly recent: readonly ActivityItem[];
}

/** The totals and the latest filled pawns, from the same read as the book. */
export function marketFigures(data: MarketData): MarketFigures {
  const filled = data.activity.filter((item) => FILLED.includes(item.deal.outcome));
  const settled = filled.filter((item) => item.deal.outcome !== 'running');
  return {
    open: data.offers.length,
    lent: filled.reduce((sum, item) => sum + BigInt(item.deal.principal?.amount ?? '0'), 0n),
    repaid: settled.filter((item) => item.deal.outcome === 'redeemed').length,
    settled: settled.length,
    recent: filled.slice(0, RECENT),
  };
}

function Tile({
  icon,
  color,
  label,
  value,
  unit,
}: {
  readonly icon: ReactNode;
  readonly color: AppIconColor;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}) {
  return (
    <div className={styles.tile}>
      <AppIcon color={color} size={40}>
        {icon}
      </AppIcon>
      <div className={styles.copy}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {value}
          {unit !== undefined && <span className={styles.unit}>{unit}</span>}
        </span>
      </div>
    </div>
  );
}

/** One short row of the book's totals, in the stat cards' look. */
export function MarketStrip({ figures }: { readonly figures: MarketFigures }) {
  return (
    <div className={styles.strip}>
      <Tile
        icon={<StorefrontIcon weight="fill" />}
        color="blue"
        label="Open offers"
        value={figures.open.toString()}
      />
      <Tile
        icon={<CoinsIcon weight="fill" />}
        color="green"
        label="Lent so far"
        value={figures.lent === 0n ? '–' : cash(figures.lent)}
        {...(figures.lent === 0n ? {} : { unit: 'USDC' })}
      />
      <Tile
        icon={<SealCheckIcon weight="fill" />}
        color="violet"
        label="Repaid on time"
        value={
          figures.settled === 0
            ? '–'
            : `${figures.repaid.toString()} of ${figures.settled.toString()}`
        }
      />
    </div>
  );
}

/** The latest filled pawns under the book, live; new or changed rows glow once. */
export function RecentPawns({ figures }: { readonly figures: MarketFigures }) {
  if (figures.recent.length === 0) return null;
  return (
    <PageSection
      label="Recent pawns"
      tag={
        <Tag
          badge="2"
          shape={<CalendarCheckIcon weight="fill" size={16} color="var(--ill-lime)" />}
        >
          Recent Pawns
        </Tag>
      }
    >
      <LiveList keys={figures.recent.map((item) => `${item.packId}:${item.deal.outcome}`)} />
      <Activity
        items={figures.recent}
        title={`Latest ${figures.recent.length.toString()}`}
        aside={<SoftPill tone="accent">Live</SoftPill>}
      />
    </PageSection>
  );
}
