import {
  ArrowSquareOutIcon,
  HandCoinsIcon,
  PauseIcon,
  PlayIcon,
  RobotIcon,
  TrayArrowDownIcon,
  TrendUpIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';

import { explorerTxUrl } from '@mosaec/config/networks';
import { AppIcon, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatCompact, formatDateTimeNs, formatUnits, padCents } from '../../../lib/format';
import { termText } from '../../../lib/pack-view';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { packPath } from '../_components/routes';

import styles from './desk.module.css';

import type { DeskLedger, DeskLedgerEvent, DeskRateCard } from '../../../lib/api';
import type { NetworkId } from '@mosaec/config/assets';
import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

export const USDC_DECIMALS = 6;
const MS_TO_NS = 1_000_000n;

export function cash(amount: string | bigint): string {
  const value = BigInt(amount);
  if (value / 10n ** BigInt(USDC_DECIMALS) >= 10_000n) return formatCompact(value, USDC_DECIMALS);
  return padCents(formatUnits(value, USDC_DECIMALS, 2));
}

export function pct(bps: number, digits = 0): string {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function when(iso: string): string {
  return formatDateTimeNs(BigInt(Date.parse(iso)) * MS_TO_NS);
}

export function packLabel(packId: string | null): string {
  return packId === null ? 'Review' : `Pack #${packId.split('.')[0] ?? packId}`;
}

function TxLink({ network, hash }: { readonly network: NetworkId; readonly hash: string | null }) {
  if (hash === null) return null;
  return (
    <a
      className={styles.tx}
      href={explorerTxUrl(network, hash)}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the transaction on the explorer"
    >
      <ArrowSquareOutIcon size={14} weight="bold" />
    </a>
  );
}

function isMark(symbol: string): symbol is keyof typeof ASSET_MARK {
  return Object.hasOwn(ASSET_MARK, symbol);
}

/** One coin's card: the monthly rate the desk quotes, its floor, LTV limit and the agent's reason. */
function CardTile({ card }: { readonly card: DeskRateCard }) {
  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.cardCoin}>
          {isMark(card.asset) && (
            <Image src={ASSET_MARK[card.asset]} alt="" width={24} height={24} />
          )}
          {card.asset}
        </span>
        <SoftPill tone={card.source === 'model' ? 'positive' : 'neutral'}>
          {card.source === 'model' ? 'Set by Agent' : 'Fallback'}
        </SoftPill>
      </header>
      <span className={styles.cardRate}>
        {pct(card.monthlyBps, 2)}
        <span className={styles.cardUnit}>a month</span>
      </span>
      <dl className={styles.cardFacts}>
        <div>
          <dt>Floor</dt>
          <dd>{card.minMonthlyBps === null ? '–' : pct(card.minMonthlyBps, 2)}</dd>
        </div>
        <div>
          <dt>Max loan to value</dt>
          <dd>{pct(card.maxLtvBps)}</dd>
        </div>
      </dl>
      <p className={styles.cardReason}>“{card.reason}”</p>
      <span className="t-caption">Set {when(card.createdAt)}</span>
    </article>
  );
}

export function RateCardPanel({ ledger }: { readonly ledger: DeskLedger }) {
  const { current, history } = ledger.rateCard;
  if (current.length === 0) {
    return (
      <p className={cx('t-body', styles.empty)}>
        The first card is written when the desk starts. Until then quotes use fair rate plus margin.
      </p>
    );
  }
  return (
    <div className={styles.cards}>
      {current.map((card) => (
        <CardTile key={card.asset} card={card} />
      ))}
      <p className={cx('t-caption', styles.cardsNote)}>
        {history.length.toString()} cards in the last 24 hours. The server keeps every card between
        fair rate plus margin and three times the fair rate, and moves it at most 0.5% a month per
        hour.
      </p>
    </div>
  );
}

export function Rules({ ledger }: { readonly ledger: DeskLedger }) {
  const p = ledger.policy;
  const floors = Object.entries(p.minAprBpsByAsset)
    .map(([symbol, bps]) => `${symbol} ${pct(bps, 1)}`)
    .join(', ');
  const rows: readonly [string, string][] = [
    ['Takes', p.assets.join(', ')],
    ['Loan to value', `At most ${pct(p.maxLtvBps)}`],
    ['Yearly rate floor', floors],
    ['Term', `${termText(p.minTermNs)} to ${termText(p.maxTermNs)}`],
    ['Per pawn', `${cash(p.minFillUsdc)} to ${cash(p.maxFillUsdc)} USDC`],
    ['Out at once', `Up to ${cash(p.maxExposureUsdc)} USDC`],
    ['Per day', `Up to ${cash(p.dailyBudgetUsdc)} USDC`],
    ['Market fills per hour', `At most ${p.maxFillsPerHour.toString()}`],
    ['Instant loans per hour', `At most ${p.maxInstantFillsPerHour.toString()}`],
    [
      'Kill switch',
      ledger.status.by === 'switch' ? `On: ${ledger.status.reason ?? 'no reason given'}` : 'Off',
    ],
  ];
  return (
    <section className={styles.policy} aria-label="Rules">
      <header className={styles.policyHead}>
        <span className="t-h5">Rules</span>
        <SoftPill tone={ledger.status.state === 'paused' ? 'warning' : 'positive'}>
          {ledger.status.state === 'paused' ? 'Paused' : 'Enforced'}
        </SoftPill>
      </header>
      <dl className={styles.rules}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.rule}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className={cx('t-caption', styles.policyNote)}>Checked on chain before every signature.</p>
    </section>
  );
}

const EVENT_ICON: Readonly<
  Record<DeskLedgerEvent['kind'], { icon: ReactNode; color: AppIconColor }>
> = {
  fill: { icon: <HandCoinsIcon weight="fill" />, color: 'green' },
  collect: { icon: <TrayArrowDownIcon weight="fill" />, color: 'blue' },
  card: { icon: <TrendUpIcon weight="fill" />, color: 'violet' },
  pause: { icon: <PauseIcon weight="fill" />, color: 'orange' },
  resume: { icon: <PlayIcon weight="fill" />, color: 'green' },
};

function eventRow(event: DeskLedgerEvent, network: NetworkId): ReactNode {
  const style = EVENT_ICON[event.kind];
  const icon = (
    <AppIcon color={style.color} size={36}>
      {style.icon}
    </AppIcon>
  );
  if ('amount' in event) {
    const amount =
      event.decimals === null
        ? event.amount
        : event.symbol === 'USDC'
          ? cash(event.amount)
          : formatUnits(BigInt(event.amount), event.decimals, 4);
    return (
      <ListRow
        key={`${event.kind}-${event.at}-${event.packId ?? ''}`}
        href={event.packId === null ? undefined : packPath(event.packId)}
        icon={icon}
        title={`${event.kind === 'fill' ? 'Lent on' : 'Collected from'} ${packLabel(event.packId)}`}
        meta={
          event.kind === 'fill'
            ? event.actor === 'instant'
              ? 'Instant loan from a quote'
              : `Open market fill by ${event.actor === 'mcp' ? 'the MCP tool' : event.actor}`
            : 'Moved into the desk balance'
        }
        value={`${amount} ${event.symbol ?? ''}`}
        valueNote={when(event.at)}
        trailing={<TxLink network={network} hash={event.txHash} />}
      />
    );
  }
  if ('asset' in event) {
    return (
      <ListRow
        key={`card-${event.asset}-${event.at}`}
        icon={icon}
        title={`${event.asset} card ${event.previousBps === null ? 'set' : 'moved'} to ${pct(event.monthlyBps, 2)} a month`}
        meta={event.reason}
        value={event.previousBps === null ? undefined : `from ${pct(event.previousBps, 2)}`}
        valueNote={`${event.source === 'model' ? 'Agent' : 'Fallback'} · ${when(event.at)}`}
      />
    );
  }
  return (
    <ListRow
      key={`${event.kind}-${event.at}`}
      icon={icon}
      title={event.kind === 'pause' ? 'Desk paused' : 'Desk resumed'}
      meta={event.reason}
      valueNote={when(event.at)}
    />
  );
}

export function LedgerEvents({ ledger }: { readonly ledger: DeskLedger }) {
  return (
    <ListCard
      title={`Events · ${ledger.events.length.toString()}`}
      pill={<SoftPill tone="neutral">Newest First</SoftPill>}
    >
      {ledger.events.length === 0 ? (
        <ListRow
          icon={
            <AppIcon color="light" size={36}>
              <RobotIcon weight="fill" />
            </AppIcon>
          }
          title="No moves yet"
          meta="Loans, collects, card changes and pauses appear here."
        />
      ) : (
        ledger.events.map((event) => eventRow(event, ledger.network))
      )}
    </ListCard>
  );
}
