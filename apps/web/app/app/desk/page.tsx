import {
  ArrowSquareOutIcon,
  CoinsIcon,
  HandCoinsIcon,
  PlugsConnectedIcon,
  ProhibitIcon,
  RobotIcon,
  SkipForwardIcon,
  StackIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { DEFAULT_NETWORK, explorerAccountUrl, explorerTxUrl } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, Callout, ErrorState, StatusPill, Tag, cx } from '@mosaec/ui';

import { getDesk, getDeskDecisions } from '../../../lib/api';
import { DESK_STATUS_LABEL, deskStatus } from '../../../lib/desk-status';
import { formatCompact, formatDateTimeNs, formatUnits, padCents } from '../../../lib/format';
import { termText } from '../../../lib/pack-view';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { PageHeader, PageSection } from '../_components/PageHeader';
import { appPath, packPath } from '../_components/routes';
import { Stat, StatRow } from '../_components/Stat';

import styles from './desk.module.css';

import type { DeskDecision, DeskOverview } from '../../../lib/api';
import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'House Desk',
  description: 'The Mosaec house desk: an agent that lends on open pawns inside a public policy.',
};
export const revalidate = 15;

const USDC_DECIMALS = 6;
const MS_TO_NS = 1_000_000n;

function cash(amount: string | bigint): string {
  const value = BigInt(amount);
  if (value / 10n ** BigInt(USDC_DECIMALS) >= 10_000n) return formatCompact(value, USDC_DECIMALS);
  return padCents(formatUnits(value, USDC_DECIMALS, 2));
}

function pct(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

const VERDICT: Readonly<
  Record<DeskDecision['verdict'], { label: string; icon: ReactNode; color: AppIconColor }>
> = {
  fill: { label: 'Filled', icon: <HandCoinsIcon weight="fill" />, color: 'green' },
  pass: { label: 'Passed', icon: <SkipForwardIcon weight="fill" />, color: 'light' },
  refused: { label: 'Refused', icon: <ProhibitIcon weight="bold" />, color: 'coral' },
  error: { label: 'Error', icon: <WarningCircleIcon weight="fill" />, color: 'orange' },
};

function packLabel(packId: string | null): string {
  return packId === null ? 'Review' : `Pack #${packId.split('.')[0] ?? packId}`;
}

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
              valueNote={`${decision.actor === 'policy' ? 'Policy' : decision.actor} · ${formatDateTimeNs(
                BigInt(Date.parse(decision.decidedAt)) * MS_TO_NS,
              )}`}
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

function Policy({ desk }: { readonly desk: DeskOverview }) {
  const p = desk.policy;
  const rows: readonly [string, string][] = [
    ['Takes', p.assets.join(', ')],
    ['Loan to value', `At most ${pct(p.maxLtvBps)}`],
    ['Rate', `At least ${pct(p.minAprBps)} a year`],
    ['Term', `${termText(p.minTermNs)} to ${termText(p.maxTermNs)}`],
    ['Per pawn', `Up to ${cash(p.maxFillUsdc)} USDC`],
    ['Out at once', `Up to ${cash(p.maxExposureUsdc)} USDC`],
    ['Per day', `Up to ${cash(p.dailyBudgetUsdc)} USDC`],
    ['Fills per hour', `At most ${p.maxFillsPerHour.toString()}`],
  ];
  return (
    <section className={styles.policy} aria-label="Policy">
      <header className={styles.policyHead}>
        <span className="t-h5">Policy</span>
        <SoftPill tone={p.paused ? 'warning' : 'positive'}>
          {p.paused ? 'Paused' : 'Enforced'}
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
    const [desk, decisions] = await Promise.all([
      getDesk(DEFAULT_NETWORK),
      getDeskDecisions(DEFAULT_NETWORK, 40),
    ]);
    return { desk, decisions };
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
  const { desk, decisions } = data;
  const usdc = desk.balances.find((b) => b.symbol === 'USDC');
  const exposure = BigInt(desk.stats.openExposureUsdc);
  const cap = BigInt(desk.policy.maxExposureUsdc);
  const status = deskStatus(desk, Date.now());
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
        title="An agent that"
        accent="lends on its own."
        lead="It reads every pawn, checks the policy and lends on its own. Every call is logged."
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
          title={status === 'paused' ? 'The desk is paused' : 'The desk is not running yet'}
        >
          {status === 'paused'
            ? 'Its policy is on hold. Open pawns wait for other lenders.'
            : 'The policy and the log below are real. Fills start once its loop runs on the server.'}
        </Callout>
      )}
      <StatRow>
        <Stat
          icon={
            <AppIcon color="blue" size={40}>
              <CoinsIcon weight="fill" />
            </AppIcon>
          }
          label="Desk balance"
          value={usdc?.amount == null ? '–' : cash(usdc.amount)}
          unit="USDC"
          note="Ready to lend"
        />
        <Stat
          icon={
            <AppIcon color="green" size={40}>
              <HandCoinsIcon weight="fill" />
            </AppIcon>
          }
          label="Lent so far"
          value={cash(desk.stats.lentUsdc)}
          unit="USDC"
          note={`${desk.stats.fills.toString()} fills, ${desk.stats.running.toString()} running`}
        />
        <Stat
          icon={
            <AppIcon color="violet" size={40}>
              <TrendUpIcon weight="fill" />
            </AppIcon>
          }
          label="Earned"
          value={cash(desk.stats.earnedUsdc)}
          unit="USDC"
          note={`${desk.stats.repaid.toString()} repaid, ${desk.stats.coinsKept.toString()} kept their coins`}
        />
        <Stat
          icon={
            <AppIcon color="orange" size={40}>
              <StackIcon weight="fill" />
            </AppIcon>
          }
          label="Out right now"
          value={cash(exposure)}
          unit="USDC"
          progress={cap === 0n ? 0 : Number((exposure * 1000n) / cap) / 1000}
          tone="warning"
          note={`Of a ${cash(cap)} USDC cap`}
        />
      </StatRow>
      <PageSection
        title="Every call, in the open"
        tag={
          <Tag badge="1" shape={<RobotIcon weight="fill" size={16} color="var(--ill-orange)" />}>
            Log
          </Tag>
        }
        lead="Refusals come from the policy. Fills and passes come from the agent."
      >
        <div className={styles.grid}>
          <DecisionLog decisions={decisions} />
          <div className={styles.side}>
            <LatestCall decisions={decisions} />
            <Policy desk={desk} />
          </div>
        </div>
      </PageSection>
    </>
  );
}
