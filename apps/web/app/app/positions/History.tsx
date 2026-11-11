'use client';

import { CoinsIcon, HandCoinsIcon, StampIcon, TrendUpIcon } from '@phosphor-icons/react';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon, ErrorState, Skeleton, StatusPill } from '@mosaec/ui';

import { DEAL_STATUS } from '../../../lib/deal-status';
import { formatDateNs, formatUnits, padCents } from '../../../lib/format';
import { amountText } from '../../../lib/pack-view';
import { usdText, usdValue, useUsdPrices } from '../../../lib/prices';
import { CoinTile } from '../_components/CoinTile';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { packPath } from '../_components/routes';
import { Stat, StatRow } from '../_components/Stat';

import styles from './positions.module.css';
import { useDealHistory } from './useDealHistory';

import type { HistoryEntry } from './useDealHistory';

const USDC = ASSETS.USDC;

function cash(amount: bigint): string {
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

function amountOf(value: { readonly amount: string } | null): bigint {
  return value === null ? 0n : BigInt(value.amount);
}

/** What the lender made on one deal: interest when repaid, the coins when not. */
function lenderResult(entry: HistoryEntry): bigint {
  const { deal } = entry;
  return deal.outcome === 'redeemed' ? amountOf(deal.repayment) - amountOf(deal.principal) : 0n;
}

function LenderStats({ entries }: { readonly entries: readonly HistoryEntry[] }) {
  const prices = useUsdPrices();
  const lent = entries.filter((entry) => entry.role === 'lender');
  const repaid = lent.filter((entry) => entry.deal.outcome === 'redeemed');
  const kept = lent.filter((entry) => entry.deal.outcome === 'forfeited');
  const principal = lent.reduce((sum, entry) => sum + amountOf(entry.deal.principal), 0n);
  const interest = repaid.reduce((sum, entry) => sum + lenderResult(entry), 0n);
  const keptValue = usdValue(
    kept.flatMap((entry) => entry.deal.collateral),
    prices,
  );
  const keptCost = kept.reduce((sum, entry) => sum + amountOf(entry.deal.principal), 0n);
  return (
    <StatRow>
      <Stat
        icon={
          <AppIcon color="blue" size={40}>
            <HandCoinsIcon weight="fill" />
          </AppIcon>
        }
        label="Lent in total"
        value={cash(principal)}
        unit="USDC"
        note={`${lent.length.toString()} finished pawn${lent.length === 1 ? '' : 's'}`}
      />
      <Stat
        icon={
          <AppIcon color="green" size={40}>
            <TrendUpIcon weight="fill" />
          </AppIcon>
        }
        label="Interest earned"
        value={cash(interest)}
        unit="USDC"
        note={`${repaid.length.toString()} repaid on time`}
      />
      <Stat
        icon={
          <AppIcon color="orange" size={40}>
            <CoinsIcon weight="fill" />
          </AppIcon>
        }
        label="Coins kept"
        value={keptValue === null ? (kept.length === 0 ? '0' : '–') : usdText(keptValue)}
        note={
          kept.length === 0
            ? 'Every borrower repaid'
            : `For ${cash(keptCost)} USDC lent, value today`
        }
      />
    </StatRow>
  );
}

function Timeline({ entries }: { readonly entries: readonly HistoryEntry[] }) {
  const lent = entries.filter((entry) => entry.role === 'lender');
  /* Running total from the oldest deal, shown newest first. */
  let total = 0n;
  const totals = [...lent].reverse().map((entry) => (total += lenderResult(entry)));
  const runningOf = new Map(lent.map((entry, i) => [entry.packId, totals[lent.length - 1 - i]]));
  return (
    <ListCard
      title={`${entries.length.toString()} finished pawn${entries.length === 1 ? '' : 's'}`}
      pill={<SoftPill tone="positive">{`${cash(total)} USDC earned`}</SoftPill>}
    >
      {entries.map((entry) => {
        const { deal } = entry;
        const lead = deal.collateral[0];
        const outcome = DEAL_STATUS[deal.outcome];
        const result = lenderResult(entry);
        const running = runningOf.get(entry.packId);
        return (
          <ListRow
            key={`${entry.packId}-${deal.settledAtNs ?? ''}`}
            href={packPath(entry.packId)}
            icon={<CoinTile symbol={lead?.symbol ?? null} />}
            title={`Pack #${entry.index} · ${lead === undefined ? 'empty' : amountText(lead)}`}
            meta={[
              entry.role === 'lender' ? 'You lent' : 'You borrowed',
              deal.settledAtNs === null ? null : formatDateNs(deal.settledAtNs),
            ]
              .filter((part) => part !== null)
              .join(' · ')}
            value={
              entry.role === 'lender'
                ? deal.outcome === 'redeemed'
                  ? `+${cash(result)} USDC`
                  : 'Kept the coins'
                : deal.outcome === 'redeemed'
                  ? 'Coins back'
                  : 'Coins kept by lender'
            }
            valueNote={
              entry.role === 'lender' && running !== undefined
                ? `${cash(running)} USDC to date`
                : undefined
            }
            trailing={
              <StatusPill tone={outcome.tone} icon={outcome.icon}>
                {outcome.label}
              </StatusPill>
            }
          />
        );
      })}
    </ListCard>
  );
}

/** Finished pawns with the lender's results: totals, then each deal with a running total. */
export function History({ accountId }: { readonly accountId: string }) {
  const state = useDealHistory(accountId);
  if (state.kind === 'loading') return <Skeleton height={240} />;
  if (state.kind === 'error') {
    return (
      <ErrorState title="History is unavailable right now">
        The indexer could not be reached. Every settled pawn stays readable on the explorer.
      </ErrorState>
    );
  }
  if (state.entries.length === 0) {
    return (
      <div className={styles.none}>
        <AppIcon color="light" size={40}>
          <StampIcon weight="fill" />
        </AppIcon>
        <span className="t-label">No finished pawns yet.</span>
      </div>
    );
  }
  return (
    <div className={styles.history}>
      {state.entries.some((entry) => entry.role === 'lender') && (
        <LenderStats entries={state.entries} />
      )}
      <Timeline entries={state.entries} />
    </div>
  );
}
