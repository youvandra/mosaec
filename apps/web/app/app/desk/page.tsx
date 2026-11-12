import {
  ArrowSquareOutIcon,
  CoinsIcon,
  HandCoinsIcon,
  PlugsConnectedIcon,
  ProhibitIcon,
  RobotIcon,
  SealCheckIcon,
  SkipForwardIcon,
  StackIcon,
  TrendUpIcon,
  VaultIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { DEFAULT_NETWORK, explorerAccountUrl, explorerTxUrl } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, Callout, ErrorState, StatusPill, Tag } from '@mosaec/ui';

import { getDesk, getDeskDecisions, getDeskLedger } from '../../../lib/api';
import { DESK_STATUS_LABEL, deskStatus } from '../../../lib/desk-status';
import { formatUnits } from '../../../lib/format';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { PageHeader, PageSection } from '../_components/PageHeader';
import { appPath, packPath } from '../_components/routes';
import { Stat, StatRow } from '../_components/Stat';

import styles from './desk.module.css';
import { LedgerEvents, RateCardPanel, Rules, cash, packLabel, when } from './LedgerParts';

import type { DeskDecision } from '../../../lib/api';
import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'House Desk',
  description:
    'The Mosaec House Desk: instant loans priced from an agent-set rate card, inside a public policy.',
};
export const revalidate = 15;

const VERDICT: Readonly<
  Record<DeskDecision['verdict'], { label: string; icon: ReactNode; color: AppIconColor }>
> = {
  fill: { label: 'Filled', icon: <HandCoinsIcon weight="fill" />, color: 'green' },
  pass: { label: 'Passed', icon: <SkipForwardIcon weight="fill" />, color: 'light' },
  refused: { label: 'Refused', icon: <ProhibitIcon weight="bold" />, color: 'coral' },
  error: { label: 'Error', icon: <WarningCircleIcon weight="fill" />, color: 'orange' },
};

function decisionMeta(decision: DeskDecision): string {
  const parts = [decision.reason];
  const quote = decision.quote;
  if (quote?.aprBps !== undefined && quote.ltvBps !== undefined) {
    parts.push(`${(quote.aprBps / 100).toFixed(1)}% APR · ${(quote.ltvBps / 100).toFixed(0)}% LTV`);
  }
  return parts.join(' · ');
}

function DecisionLog({ decisions }: { readonly decisions: readonly DeskDecision[] }) {
  const fills = decisions.filter((d) => d.verdict === 'fill').length;
  return (
    <ListCard
      title={`Decision log · ${decisions.length.toString()}`}
      pill={
        <SoftPill
          tone={fills > 0 ? 'positive' : 'neutral'}
        >{`${fills.toString()} filled`}</SoftPill>
      }
    >
      {decisions.length === 0 ? (
        <ListRow
          icon={
            <AppIcon color="light" size={36}>
              <RobotIcon weight="fill" />
            </AppIcon>
          }
          title="No decisions yet"
          meta="The desk checks the book every five minutes."
        />
      ) : (
        decisions.map((decision) => {
          const verdict = VERDICT[decision.verdict];
          return (
            <ListRow
              key={decision.id}
              href={decision.packId === null ? undefined : packPath(decision.packId)}
              icon={
                <AppIcon color={verdict.color} size={36}>
                  {verdict.icon}
                </AppIcon>
              }
              title={`${verdict.label} ${packLabel(decision.packId)}`}
              meta={decisionMeta(decision)}
              value={
                decision.quote?.principal === undefined
                  ? undefined
                  : `${cash(decision.quote.principal)} USDC`
              }
              valueNote={`${decision.actor === 'policy' ? 'Policy' : decision.actor} · ${when(decision.decidedAt)}`}
              trailing={
                decision.txHash === null ? undefined : (
                  <a
                    className={styles.tx}
                    href={explorerTxUrl(DEFAULT_NETWORK, decision.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open the fill on the explorer"
                  >
                    <ArrowSquareOutIcon size={14} weight="bold" />
                  </a>
                )
              }
            />
          );
        })
      )}
    </ListCard>
  );
}

function LatestCall({ decisions }: { readonly decisions: readonly DeskDecision[] }) {
  const latest = decisions.find((d) => d.verdict === 'fill' || d.verdict === 'pass');
  return (
    <section className={styles.agent} aria-label="Latest agent call">
      <div className={styles.agentHead}>
        <span className={styles.mono}>Latest agent call</span>
        <span className={styles.chip}>
          <RobotIcon size={12} weight="fill" />
          {latest?.actor ?? 'Self-hosted model'}
        </span>
      </div>
      <div className={styles.slot}>
        <span className={styles.mono}>
          {latest === undefined
            ? 'Waiting for an offer'
            : `${VERDICT[latest.verdict].label} ${packLabel(latest.packId)}`}
        </span>
        <p className={styles.quote}>
          {latest === undefined
            ? 'The agent writes its reason here after its next call.'
            : `“${latest.reason}”`}
        </p>
      </div>
    </section>
  );
}

async function load() {
  try {
    const [desk, ledger, decisions] = await Promise.all([
      getDesk(DEFAULT_NETWORK),
      getDeskLedger(DEFAULT_NETWORK),
      getDeskDecisions(DEFAULT_NETWORK, 40),
    ]);
    return { desk, ledger, decisions };
  } catch {
    return null;
  }
}

export default async function DeskPage() {
  const data = await load();
  if (data === null) {
    return (
      <ErrorState title="The desk is unavailable right now" icon={<WarningCircleIcon size={22} />}>
        The API could not be reached. The desk account and its fills stay readable on the explorer.
      </ErrorState>
    );
  }
  const { desk, ledger, decisions } = data;
  const { book } = ledger;
  const status = deskStatus(desk, Date.now());
  const treasury = ledger.treasury.usdc;
  const keptMark = book.keptCoins.reduce((total, coin) => total + BigInt(coin.markUsdc ?? '0'), 0n);
  const keptLabel = book.keptCoins
    .map((coin) => `${formatUnits(BigInt(coin.amount), coin.decimals, 4)} ${coin.symbol}`)
    .join(', ');
  const headline =
    status === 'live'
      ? { title: 'Lending now,', accent: `${treasury === null ? '–' : cash(treasury)} USDC ready.` }
      : status === 'paused'
        ? { title: 'Paused,', accent: 'open pawns wait for other lenders.' }
        : { title: 'Offline,', accent: 'the loop is between runs.' };
  return (
    <>
      <PageHeader
        eyebrow={
          <Tag
            badge="Team-run"
            shape={<RobotIcon weight="fill" size={16} color="var(--ill-lime)" />}
          >
            House Desk
          </Tag>
        }
        title={headline.title}
        accent={headline.accent}
        lead="The desk quotes instant loans from an hourly rate card its agent sets, lends inside a public policy and books every move below."
        actions={
          <>
            <StatusPill
              tone={status === 'live' ? 'positive' : status === 'paused' ? 'warning' : 'neutral'}
              size="md"
            >
              {DESK_STATUS_LABEL[status]}
            </StatusPill>
            <ButtonLink
              href={explorerAccountUrl(DEFAULT_NETWORK, desk.accountId)}
              variant="secondary"
              icon={<ArrowSquareOutIcon size={16} weight="bold" />}
            >
              {desk.accountId}
            </ButtonLink>
            <ButtonLink
              href={appPath('/agents')}
              as={Link}
              icon={<PlugsConnectedIcon size={16} weight="fill" />}
            >
              Connect Your Agent
            </ButtonLink>
          </>
        }
      />
      {status !== 'live' && (
        <Callout
          tone={status === 'paused' ? 'warning' : 'info'}
          title={status === 'paused' ? 'The desk is paused' : 'The desk loop is between runs'}
        >
          {status === 'paused'
            ? (ledger.status.reason ?? 'Its policy is on hold.')
            : 'The books below are real. New loans resume once the loop runs again.'}
        </Callout>
      )}
      <StatRow>
        <Stat
          icon={
            <AppIcon color="blue" size={40}>
              <VaultIcon weight="fill" />
            </AppIcon>
          }
          label="Treasury"
          value={treasury === null ? '–' : cash(treasury)}
          unit="USDC"
          note={`${cash(book.budgetLeftTodayUsdc)} USDC left to lend today`}
        />
        <Stat
          icon={
            <AppIcon color="orange" size={40}>
              <StackIcon weight="fill" />
            </AppIcon>
          }
          label="Lent now"
          value={cash(book.lentNowUsdc)}
          unit="USDC"
          progress={book.utilisationBps / 10_000}
          tone="warning"
          note={`${book.running.toString()} running · ${(book.utilisationBps / 100).toFixed(0)}% of the limit`}
        />
        <Stat
          icon={
            <AppIcon color="violet" size={40}>
              <TrendUpIcon weight="fill" />
            </AppIcon>
          }
          label="Interest earned"
          value={cash(book.realisedInterestUsdc)}
          unit="USDC"
          note={`${book.repaid.toString()} repaid of ${book.fills.toString()} loans`}
        />
        <Stat
          icon={
            <AppIcon color="green" size={40}>
              <CoinsIcon weight="fill" />
            </AppIcon>
          }
          label="Coins kept"
          value={book.forfeited === 0 ? '0' : cash(keptMark)}
          unit={book.forfeited === 0 ? 'pawns' : 'USDC'}
          note={
            book.forfeited === 0
              ? 'Every borrower repaid so far'
              : `${keptLabel} ${
                  book.keptCoins.every((coin) => coin.markSource === 'near-intents')
                    ? 'at a NEAR Intents quote, not executed'
                    : book.keptCoins.some((coin) => coin.markSource === 'near-intents')
                      ? 'at NEAR Intents quotes (not executed) and the reference price'
                      : 'at the reference price'
                }`
          }
        />
      </StatRow>
      <PageSection
        title="How the desk prices"
        tag={
          <Tag badge="1" shape={<SealCheckIcon weight="fill" size={16} color="var(--ill-lime)" />}>
            Rate Card
          </Tag>
        }
        lead="Every hour the agent reads volatility, how much is lent and how pawns ended, then proposes a rate per coin. The server holds it inside fixed bounds."
      >
        <div className={styles.grid}>
          <RateCardPanel ledger={ledger} />
          <div className={styles.side}>
            <Rules ledger={ledger} />
          </div>
        </div>
      </PageSection>
      <PageSection
        title="Every move, in the open"
        tag={
          <Tag
            badge="2"
            shape={<HandCoinsIcon weight="fill" size={16} color="var(--ill-orange)" />}
          >
            Ledger
          </Tag>
        }
        lead="Loans, collects, rate changes and pauses, each with its transaction."
      >
        <div className={styles.grid}>
          <LedgerEvents ledger={ledger} />
          <div className={styles.side}>
            <LatestCall decisions={decisions} />
          </div>
        </div>
      </PageSection>
      <PageSection
        title="Every call on the open market"
        tag={
          <Tag badge="3" shape={<RobotIcon weight="fill" size={16} color="var(--ill-orange)" />}>
            Log
          </Tag>
        }
        lead="Refusals come from the policy. Fills and passes come from the agent."
      >
        <DecisionLog decisions={decisions} />
      </PageSection>
    </>
  );
}
