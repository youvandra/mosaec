import {
  ArrowSquareOutIcon,
  HandCoinsIcon,
  PauseIcon,
  PlayIcon,
  ProhibitIcon,
  RobotIcon,
  TrayArrowDownIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';

import { explorerAccountUrl } from '@mosaec/config/networks';
import { AppIcon, cx } from '@mosaec/ui';

import { formatCompact, formatDateTimeNs, formatUnits, padCents } from '../../../lib/format';
import { termText } from '../../../lib/pack-view';
import { CoinTile } from '../_components/CoinTile';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { packPath } from '../_components/routes';

import styles from './desk.module.css';

import type { DeskDecision, DeskLedger, DeskLedgerEvent, DeskRateCard } from '../../../lib/api';
import type { AppIconColor } from '@mosaec/ui';
import type { CSSProperties, ReactNode } from 'react';

const USDC_DECIMALS = 6;
const MS_TO_NS = 1_000_000n;
/** Bars on a rate tile: the last eight hourly cards for that coin. */
const RATE_BARS = 8;
/** Rows in the activity feed. */
const FEED_ROWS = 12;

export function cash(amount: string | bigint): string {
  const value = BigInt(amount);
  if (value / 10n ** BigInt(USDC_DECIMALS) >= 10_000n) return formatCompact(value, USDC_DECIMALS);
  return padCents(formatUnits(value, USDC_DECIMALS, 2));
}

function pct(bps: number, digits = 0): string {
  return `${(bps / 100).toFixed(digits)}%`;
}

function when(iso: string): string {
  return formatDateTimeNs(BigInt(Date.parse(iso)) * MS_TO_NS);
}

function packLabel(packId: string | null): string {
  return packId === null ? 'Review' : `Pack #${packId.split('.')[0] ?? packId}`;
}

function share(part: bigint, total: bigint): number {
  return total === 0n ? 0 : Number((part * 10_000n) / total) / 100;
}

/** Kept coins at their mark in USDC units: the Intents quote when there is one. */
export function keptValue(ledger: DeskLedger): bigint {
  return ledger.book.keptCoins.reduce((total, coin) => total + BigInt(coin.markUsdc ?? '0'), 0n);
}

/** Source: Treasury › Portfolio card. Where the desk's money sits, as one segmented bar. */
export function Treasury({ ledger }: { readonly ledger: DeskLedger }) {
  const ready = BigInt(ledger.treasury.usdc ?? '0');
  const lent = BigInt(ledger.book.lentNowUsdc);
  const kept = keptValue(ledger);
  const total = ready + lent + kept;
  const parts = [
    { key: 'ready', label: 'Ready to lend', value: ready, tone: styles.blue },
    { key: 'lent', label: 'Out on loans', value: lent, tone: styles.orange },
    { key: 'kept', label: 'Coins kept', value: kept, tone: styles.green },
  ] as const;
  return (
    <section className={styles.treasury} aria-label="Treasury">
      <header className={styles.treasuryHead}>
        <span className={styles.cardTitle}>Treasury</span>
        <SoftPill tone={ledger.status.state === 'live' ? 'positive' : 'warning'}>
          {ledger.status.state === 'live' ? 'Lending' : 'Paused'}
        </SoftPill>
      </header>
      <span className={styles.bigRow}>
        <span className={styles.big}>{padCents(formatUnits(total, USDC_DECIMALS, 2))}</span>
        <span className={styles.bigUnit}>USDC</span>
      </span>
      <div className={styles.segments} aria-hidden="true">
        {parts
          .filter((part) => part.value > 0n)
          .map((part) => (
            <span
              key={part.key}
              className={part.tone}
              style={{ flexGrow: Math.max(share(part.value, total), 1.5) }}
            />
          ))}
      </div>
      <ul className={styles.legend}>
        {parts.map((part) => (
          <li key={part.key}>
            <span className={cx(styles.dot, part.tone)} />
            <span className={styles.legendLabel}>{part.label}</span>
            <span className={styles.legendValue}>{cash(part.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Source: Payouts › Stats. Four outcomes, ruled on the left. */
export function Results({ ledger }: { readonly ledger: DeskLedger }) {
  const { book } = ledger;
  const items: readonly [string, string][] = [
    [book.fills.toString(), book.fills === 1 ? 'loan made' : 'loans made'],
    [book.repaid.toString(), 'repaid'],
    [book.forfeited.toString(), book.forfeited === 1 ? 'pawn kept' : 'pawns kept'],
    [cash(book.realisedInterestUsdc), 'USDC interest'],
  ];
  return (
    <dl className={styles.results}>
      {items.map(([value, label]) => (
        <div key={label}>
          <dd>{value}</dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** Source: Payouts › Rule Panel. The policy as a dark control stack, today's budget as a fill. */
export function RulePanel({ ledger }: { readonly ledger: DeskLedger }) {
  const p = ledger.policy;
  const used = BigInt(p.dailyBudgetUsdc) - BigInt(ledger.book.budgetLeftTodayUsdc);
  const usedShare = share(used < 0n ? 0n : used, BigInt(p.dailyBudgetUsdc));
  const paused = ledger.status.state === 'paused';
  return (
    <section className={styles.rules} aria-label="Rules">
      <div className={styles.block}>
        <span className={styles.mono}>Lends up to</span>
        <span className={styles.blockValue}>{pct(p.maxLtvBps)} of the coins</span>
      </div>
      <div className={styles.block}>
        <span className={styles.mono}>Per pawn</span>
        <span className={styles.blockValue}>
          {cash(p.minFillUsdc)} to {cash(p.maxFillUsdc)} USDC
        </span>
      </div>
      <div className={styles.block}>
        <span
          className={styles.blockFill}
          style={{ '--fill': `${usedShare.toString()}%` } as CSSProperties}
          aria-hidden="true"
        />
        <span className={styles.mono}>Lent today</span>
        <span className={styles.blockValue}>
          {cash(used < 0n ? 0n : used)} / {cash(p.dailyBudgetUsdc)}
        </span>
      </div>
      <div className={styles.block}>
        <span className={styles.mono}>Terms</span>
        <span className={styles.blockValue}>
          {termText(p.minTermNs)} to {termText(p.maxTermNs)}
        </span>
      </div>
      <div className={cx(styles.block, styles.blockSwitch)}>
        <span className={cx(styles.mono, styles.switchLabel)}>Kill switch</span>
        <span className={styles.switch} role="img" aria-label={paused ? 'On' : 'Off'}>
          <span className={cx(!paused && styles.switchOn)}>Off</span>
          <span className={cx(paused && styles.switchOn)}>On</span>
        </span>
      </div>
      <a
        className={styles.account}
        href={explorerAccountUrl(ledger.network, ledger.accountId)}
        target="_blank"
        rel="noreferrer"
      >
        {ledger.accountId}
        <ArrowSquareOutIcon size={12} weight="bold" />
      </a>
    </section>
  );
}

/** Source: Treasury tile. One coin: today's rate, the last cards as bars. */
function RateTile({
  card,
  history,
}: {
  readonly card: DeskRateCard;
  readonly history: readonly DeskRateCard[];
}) {
  const recent = history
    .filter((entry) => entry.asset === card.asset)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-RATE_BARS);
  const bars = recent.length > 0 ? recent : [card];
  const top = Math.max(...bars.map((entry) => entry.monthlyBps), 1);
  return (
    <article className={styles.rate}>
      <header className={styles.rateHead}>
        <span className={styles.rateCoin}>
          <CoinTile symbol={card.asset} size={32} />
          {card.asset}
        </span>
        <SoftPill tone={card.source === 'model' ? 'positive' : 'neutral'}>
          {card.source === 'model' ? 'Agent' : 'Fair + Margin'}
        </SoftPill>
      </header>
      <span className={styles.rateFigure}>
        {pct(card.monthlyBps, 2)}
        <span className={styles.rateUnit}>a month</span>
      </span>
      <div className={styles.bars} aria-hidden="true">
        {bars.map((entry, index) => (
          <span
            key={entry.createdAt}
            className={cx(index === bars.length - 1 && styles.barNow)}
            style={{ height: `${Math.max((entry.monthlyBps / top) * 100, 12).toString()}%` }}
          />
        ))}
      </div>
      <span className={cx('t-caption', styles.rateNote)}>
        Floor {card.minMonthlyBps === null ? '–' : pct(card.minMonthlyBps, 2)} ·{' '}
        {when(card.createdAt)}
      </span>
    </article>
  );
}

export function RateCards({ ledger }: { readonly ledger: DeskLedger }) {
  const { current, history } = ledger.rateCard;
  if (current.length === 0) {
    return (
      <p className={cx('t-body', styles.empty)}>The first card is written when the desk starts.</p>
    );
  }
  return (
    <div className={styles.rates}>
      {current.map((card) => (
        <RateTile key={card.asset} card={card} history={history} />
      ))}
    </div>
  );
}

interface FeedItem {
  readonly key: string;
  readonly at: number;
  readonly row: ReactNode;
}

function tile(color: AppIconColor, glyph: ReactNode) {
  return (
    <AppIcon color={color} size={36}>
      {glyph}
    </AppIcon>
  );
}

function eventItem(event: DeskLedgerEvent): FeedItem | null {
  if (event.kind === 'card') return null;
  const key = `${event.kind}-${event.at}-${'packId' in event ? (event.packId ?? '') : ''}`;
  if (!('amount' in event)) {
    return {
      key,
      at: Date.parse(event.at),
      row: (
        <ListRow
          key={key}
          icon={
            event.kind === 'pause'
              ? tile('orange', <PauseIcon weight="fill" />)
              : tile('green', <PlayIcon weight="fill" />)
          }
          title={event.kind === 'pause' ? 'Desk paused' : 'Desk resumed'}
          meta={when(event.at)}
        />
      ),
    };
  }
  const amount =
    event.decimals === null
      ? event.amount
      : event.symbol === 'USDC'
        ? cash(event.amount)
        : formatUnits(BigInt(event.amount), event.decimals, 4);
  const lent = event.kind === 'fill';
  return {
    key,
    at: Date.parse(event.at),
    row: (
      <ListRow
        key={key}
        href={event.packId === null ? undefined : packPath(event.packId)}
        icon={
          lent
            ? tile('green', <HandCoinsIcon weight="fill" />)
            : tile('blue', <TrayArrowDownIcon weight="fill" />)
        }
        title={`${lent ? 'Lent on' : 'Collected'} ${packLabel(event.packId)}`}
        meta={`${
          lent
            ? event.actor === 'instant'
              ? 'Instant loan'
              : event.actor === 'mcp'
                ? 'Agent tool'
                : 'Open market'
            : event.symbol === 'USDC'
              ? 'Repayment'
              : 'Kept coins'
        } · ${when(event.at)}`}
        value={`${lent ? '−' : '+'}${amount} ${event.symbol ?? ''}`}
      />
    ),
  };
}

/** Policy refusals read as written; a failed signature gets a plain sentence. */
function turnedAway(decision: DeskDecision): string {
  if (decision.verdict === 'refused') return decision.reason;
  if (decision.verdict === 'pass') return 'The agent passed on the offer.';
  return 'The signature did not go through. The offer stayed open.';
}

function decisionItem(decision: DeskDecision): FeedItem | null {
  if (decision.verdict === 'fill') return null;
  const key = `decision-${decision.id}`;
  return {
    key,
    at: Date.parse(decision.decidedAt),
    row: (
      <ListRow
        key={key}
        href={decision.packId === null ? undefined : packPath(decision.packId)}
        icon={
          decision.verdict === 'error'
            ? tile('orange', <WarningCircleIcon weight="fill" />)
            : decision.verdict === 'pass'
              ? tile('light', <RobotIcon weight="fill" />)
              : tile('coral', <ProhibitIcon weight="bold" />)
        }
        title={`${
          decision.verdict === 'pass'
            ? 'Passed on'
            : decision.verdict === 'error'
              ? 'Could not fill'
              : 'Turned down'
        } ${packLabel(decision.packId)}`}
        meta={`${turnedAway(decision)} · ${when(decision.decidedAt)}`}
        value={decision.quote?.principal === undefined ? undefined : cash(decision.quote.principal)}
        valueNote={decision.quote?.principal === undefined ? undefined : 'USDC asked'}
      />
    ),
  };
}

/** Source: Payouts › "Payouts today" list. Every move and every no, newest first. */
export function Activity({
  ledger,
  decisions,
}: {
  readonly ledger: DeskLedger;
  readonly decisions: readonly DeskDecision[];
}) {
  const items = [...ledger.events.map(eventItem), ...decisions.map(decisionItem)]
    .filter((item): item is FeedItem => item !== null)
    .sort((a, b) => b.at - a.at)
    .slice(0, FEED_ROWS);
  return (
    <ListCard
      title="Activity"
      pill={
        <SoftPill tone={ledger.status.state === 'live' ? 'positive' : 'warning'}>Live</SoftPill>
      }
    >
      {items.length === 0 ? (
        <ListRow
          icon={tile('light', <RobotIcon weight="fill" />)}
          title="No moves yet"
          meta="Loans, collects and refusals land here."
        />
      ) : (
        items.map((item) => item.row)
      )}
    </ListCard>
  );
}

/** Model reasons that read like variable dumps stay out of the page. */
function readable(reason: string): boolean {
  return !/[a-z]+_[a-z_]+/.test(reason) && reason.length <= 160;
}

/** The agent: which model, its last call on the market, and when it last set the card. */
export function AgentCard({
  ledger,
  decisions,
}: {
  readonly ledger: DeskLedger;
  readonly decisions: readonly DeskDecision[];
}) {
  const calls = decisions.filter(
    (d) =>
      (d.verdict === 'fill' || d.verdict === 'pass') &&
      !['instant', 'policy', 'mcp'].includes(d.actor),
  );
  const latest = calls[0];
  const model = latest?.actor ?? 'Self-hosted model';
  const lastCard = ledger.rateCard.current
    .map((card) => card.createdAt)
    .sort()
    .at(-1);
  return (
    <section className={styles.agent} aria-label="Agent">
      <header className={styles.agentHead}>
        <AppIcon color="ink" size={40}>
          <RobotIcon weight="fill" />
        </AppIcon>
        <span className={styles.agentName}>
          <span className={styles.cardTitle}>Agent</span>
          <span className="t-caption">{model} · runs on our server</span>
        </span>
      </header>
      <div className={styles.slotLight}>
        <span className={styles.label}>Last call</span>
        <span className={styles.slotValue}>
          {latest === undefined
            ? 'Waiting for an offer'
            : `${latest.verdict === 'fill' ? 'Filled' : 'Passed'} ${packLabel(latest.packId)}`}
        </span>
        {latest?.quote?.aprBps !== undefined && latest.quote.ltvBps !== undefined && (
          <span className={styles.facts}>
            <span>{pct(latest.quote.aprBps, 1)} APR</span>
            <span>{pct(latest.quote.ltvBps)} LTV</span>
            {latest.quote.principal !== undefined && (
              <span>{cash(latest.quote.principal)} USDC</span>
            )}
          </span>
        )}
        {latest !== undefined && readable(latest.reason) && (
          <p className={styles.reason}>“{latest.reason}”</p>
        )}
      </div>
      <div className={styles.slotLight}>
        <span className={styles.label}>Rate card</span>
        <span className={styles.slotValue}>
          {lastCard === undefined ? 'Not set yet' : `Updated ${when(lastCard)}`}
        </span>
        <span className="t-caption">Hourly, kept between fair rate plus margin and 3× fair.</span>
      </div>
    </section>
  );
}
