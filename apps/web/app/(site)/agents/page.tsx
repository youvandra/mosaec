import {
  ChartLineUpIcon,
  ClockIcon,
  CoinsIcon,
  GaugeIcon,
  HandCoinsIcon,
  LightningIcon,
  PauseCircleIcon,
  RobotIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { deskPolicy } from '@mosaec/config/desk';
import { DESK_MARGIN_BPS, FAIR_MONTHLY_RATE_BPS, rateBounds } from '@mosaec/config/rates';
import { ERROR_CATALOG } from '@mosaec/domain';
import { AppIcon, ButtonLink, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import { formatUnits } from '../../../lib/format';
import { SITE } from '../../../lib/site';
import {
  BluePanel,
  CapabilityList,
  Checkerboard,
  CompareBars,
  Eyebrow,
  FaqBlock,
  SectionIntro,
} from '../_blocks';

import styles from './agents.module.css';

import type { Capability, CompareRow } from '../_blocks';
import type { ErrorCode } from '@mosaec/domain';
import type { AppIconColor } from '@mosaec/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'House Desk',
  description:
    'The Mosaec House Desk lends USDC against sealed ZEC, BTC and SOL at once, priced from an hourly rate card its agent sets inside fixed bounds.',
};

const POLICY = deskPolicy('testnet');
const USDC_DECIMALS = 6;
const usdc = (amount: bigint) => formatUnits(amount, USDC_DECIMALS, 0);
const pct = (bps: number, digits = 2) => `${(bps / 100).toFixed(digits)}%`;
const DESK_APP = `${SITE.appUrl}/desk`;
const BORROW_APP = `${SITE.appUrl}/borrow`;

const LENDS: readonly Capability[] = [
  {
    title: 'Coins',
    body: `${POLICY.assets.join(', ')}, sealed in a keyless pack. One coin per pack.`,
    icon: <CoinsIcon weight="fill" />,
    color: 'blue',
  },
  {
    title: 'Size',
    body: `${usdc(POLICY.minFillUsdc)} to ${usdc(POLICY.maxFillUsdc)} USDC per loan, up to ${pct(POLICY.maxLtvBps, 0)} of the coins' value.`,
    icon: <HandCoinsIcon weight="fill" />,
    color: 'green',
  },
  {
    title: 'Term',
    body: 'Thirty, sixty or ninety days. A fifteen-minute term runs on testnet for rehearsals.',
    icon: <ClockIcon weight="fill" />,
    color: 'violet',
  },
  {
    title: 'Speed',
    body: 'The quote holds for ten minutes. Sign the offer and the USDC lands in the same minute.',
    icon: <LightningIcon weight="fill" />,
    color: 'orange',
  },
];

const SYMBOLS = ['ZEC', 'SOL', 'BTC'] as const;
const TOP_FLOOR = Math.max(...SYMBOLS.map((symbol) => rateBounds(symbol).minMonthlyBps));
const RATES: readonly CompareRow[] = SYMBOLS.map((symbol) => {
  const { minMonthlyBps, maxMonthlyBps } = rateBounds(symbol);
  return {
    name: symbol,
    note: `Fair ${pct(FAIR_MONTHLY_RATE_BPS[symbol])} plus ${pct(DESK_MARGIN_BPS)} margin, capped at ${pct(maxMonthlyBps)}`,
    value: `from ${pct(minMonthlyBps)} a month`,
    ratio: minMonthlyBps / TOP_FLOOR,
  };
});

const FAQ = [
  {
    q: 'Who runs the House Desk?',
    a: 'The Mosaec team, from a desk account that holds only the desk budget. Every loan, collect and rate change is on its public ledger.',
  },
  {
    q: 'What does the agent decide?',
    a: 'The rate card. Once an hour it reads volatility, how much is lent and how past pawns ended, and proposes a rate and a loan-to-value limit per coin. The server clamps each proposal and signs every loan itself.',
  },
  {
    q: 'What if the agent is down?',
    a: 'The desk quotes the fallback card: fair rate plus margin. Instant loans keep working, since no model sits in the loan path.',
  },
  {
    q: 'Can the open market beat the desk?',
    a: 'Yes. Set your own repayment and any lender can fill it. The desk is the quick answer; the market is the price competition.',
  },
  {
    q: 'What happens if I miss the date?',
    a: 'The desk keeps the coins in the pack. There is no liquidation before the date, whatever the price does.',
  },
  {
    q: 'Can the desk be stopped?',
    a: 'A kill switch pauses every quote and every signature at once, without a redeploy. The ledger shows when and why.',
  },
] as const;

/** A light checkerboard cell: one rule and the catalog code the desk answers with. */
function RuleCard({
  icon,
  color,
  title,
  caption,
  code,
  pill,
}: {
  readonly icon: ReactNode;
  readonly color: AppIconColor;
  readonly title: string;
  readonly caption: string;
  readonly code: Extract<ErrorCode, `DESK_${string}`>;
  readonly pill: string;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <AppIcon color={color} size={36}>
          {icon}
        </AppIcon>
        <div>
          <div className="t-label">{title}</div>
          <div className="t-caption">{caption}</div>
        </div>
      </div>
      <code className={styles.codeChip}>{code}</code>
      <p className="t-body-sm">{ERROR_CATALOG[code].message}</p>
      <div className={styles.cardFoot}>
        <StatusPill tone="neutral" dot={false}>
          {pill}
        </StatusPill>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="desk-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.heroContent}>
        <Reveal trigger="load" delay={0.1}>
          <Tag badge="Mosaec" shape={<RobotIcon weight="fill" size={16} color="var(--ill-lime)" />}>
            House Desk
          </Tag>
        </Reveal>
        <WordReveal
          id="desk-title"
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Seal your coins.', { text: 'Get USDC in a minute.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.5} className={cx('t-body-lg', styles.lead)}>
          The House Desk is the lender Mosaec runs. It quotes a fixed repayment on your ZEC, BTC or
          SOL, fills your offer at once and never liquidates before the date.
        </Reveal>
        <Reveal trigger="load" delay={0.65} className={styles.actions}>
          <ButtonLink href={BORROW_APP} as={Link}>
            Get a Desk Loan
          </ButtonLink>
          <ButtonLink href={DESK_APP} as={Link} variant="secondary" showIcon>
            View the Ledger
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

export default function HouseDeskPage() {
  return (
    <>
      <Hero />
      <Section id="lends" label="What it lends">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="1"
              shape={<HandCoinsIcon weight="fill" size={16} color="var(--ill-green)" />}
              label="What It Lends"
            />
          }
          title={['One quote,', 'one fixed repayment.']}
          lead="Pick the coin, the amount and the term. The desk answers with the loan and the repayment, and holds that price for ten minutes."
        />
        <CapabilityList items={LENDS} />
      </Section>
      <Section id="pricing" label="How it prices">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="2"
              shape={<ChartLineUpIcon weight="fill" size={16} color="var(--ill-violet)" />}
              label="How It Prices"
            />
          }
          title={['An agent sets the card,', 'code holds the bounds.']}
          lead="Every hour the desk agent proposes a monthly rate per coin from 30-day volatility, how much is lent and how pawns ended. The server keeps it between the floor and three times the fair rate, and moves it at most 0.5% a month per hour."
        />
        <CompareBars
          rows={RATES}
          footnote="Floors at 50% loan to value. The live card, with the agent's reason for each rate, is on the ledger."
        />
      </Section>
      <Section id="rules" label="Rules">
        <SectionIntro
          layout="center"
          eyebrow={
            <Eyebrow
              badge="3"
              shape={<ShieldCheckIcon weight="fill" size={16} color="var(--ill-green)" />}
              label="Rules"
            />
          }
          title={['Limits in code,', 'books in the open.']}
        />
        <Checkerboard
          cells={[
            {
              kind: 'dark',
              icon: <GaugeIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'A budget it cannot pass',
              body: `At most ${usdc(POLICY.maxExposureUsdc)} USDC out at once and ${usdc(POLICY.dailyBudgetUsdc)} USDC a day. One lock covers every loan path, so two loans never share the last of a budget.`,
            },
            {
              kind: 'light',
              visual: (
                <RuleCard
                  icon={<UserIcon weight="fill" />}
                  color="blue"
                  title="One loan per borrower"
                  caption="Checked at quote and at fill"
                  code="DESK_OPEN_LOAN"
                  pill="Repay to Borrow Again"
                />
              ),
            },
            {
              kind: 'light',
              visual: (
                <RuleCard
                  icon={<PauseCircleIcon weight="fill" />}
                  color="orange"
                  title="Kill switch"
                  caption="Read before every signature"
                  code="DESK_PAUSED"
                  pill="Open Loans Keep Their Terms"
                />
              ),
            },
            {
              kind: 'dark',
              icon: <ShieldCheckIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'Checked again on chain',
              body: 'The registry checks the coins, terms and amount of every fill. Any mismatch refunds the USDC in the same settlement.',
            },
          ]}
        />
      </Section>
      <BluePanel
        icon={<RobotIcon weight="fill" />}
        title="Bring your own agent too."
        body="The desk tools are public. Your agent can read the same book, price the same pawns and lend your money inside your rules."
        pills={['Public MCP', 'Your Rules', 'Your Wallet']}
      />
      <FaqBlock title="The House Desk, answered." items={FAQ} />
    </>
  );
}
