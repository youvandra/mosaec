import {
  ArrowsLeftRightIcon,
  CalendarCheckIcon,
  CoinsIcon,
  FlagIcon,
  HandCoinsIcon,
  LockKeyIcon,
  PaperPlaneTiltIcon,
  ScalesIcon,
  SealCheckIcon,
  SparkleIcon,
  TicketIcon,
  TrendDownIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { AppIcon, ButtonLink, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { PAWN_STATUS } from '../../../lib/deal-status';
import { Checks, CompareBars, Eyebrow, FaqBlock, Journey, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E, ROLLING_REPLAY as R } from '../_content/facts';

import styles from './borrow.module.css';

import type { CompareRow, JourneyStep } from '../_blocks';
import type { PawnStatus } from '@mosaec/domain';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Borrow',
  description:
    'Borrow USDC against ZEC, BTC or SOL on NEAR with a fixed repayment, a fixed date and zero liquidation. Miss the date and the pack is the whole debt.',
};

const APP_BORROW = '/app/borrow';

/* Hero: blue panel with a live quote card (Payouts > Hero). */

function QuoteSide({
  label,
  amount,
  symbol,
  mark,
}: {
  readonly label: string;
  readonly amount: string;
  readonly symbol: string;
  readonly mark: string;
}) {
  return (
    <div className={styles.quoteSide}>
      <div className={styles.quoteFigures}>
        <span className="t-caption">{label}</span>
        <span className={styles.quoteAmount}>{amount}</span>
      </div>
      <span className={styles.chip}>
        <Image src={mark} alt="" width={22} height={22} />
        {symbol}
      </span>
    </div>
  );
}

function QuoteCard() {
  return (
    <div className={styles.quote}>
      <QuoteSide label="You deposit" amount={E.collateral} symbol="ZEC" mark={ASSET_MARK.ZEC} />
      <dl className={styles.quoteRows}>
        <div>
          <dt>Suggested rate</dt>
          <dd>{E.monthlyRate} a month</dd>
        </div>
        <div>
          <dt>Repayment</dt>
          <dd>{E.repayment} USDC</dd>
        </div>
        <div>
          <dt>Term</dt>
          <dd>{E.termDays} days</dd>
        </div>
      </dl>
      <QuoteSide label="You receive" amount={E.principal} symbol="USDC" mark={ASSET_MARK.USDC} />
      <p className={cx('t-caption', styles.quoteHint)}>The price is yours to change</p>
      <div className={styles.quoteFoot}>
        <div>
          <span className="t-caption">Repay within</span>
          <span className="t-label">{E.termDays} days</span>
        </div>
        <ButtonLink href={APP_BORROW} as={Link} variant="accent" size="sm">
          Send Offer
        </ButtonLink>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="borrow-title">
      <div className={styles.panel}>
        <span className={styles.ring} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <Reveal trigger="load" delay={0.1}>
            <Tag
              badge="Mosaec"
              shape={<SparkleIcon weight="fill" color="var(--ill-lime)" size={18} />}
            >
              Borrow
            </Tag>
          </Reveal>
          <WordReveal
            id="borrow-title"
            as="h1"
            trigger="load"
            className={cx('t-display', styles.title)}
            lines={[
              'Borrow on your coins.',
              { text: 'Never liquidated.', className: styles.lime ?? '' },
            ]}
          />
          <Reveal as="p" trigger="load" delay={0.55} className={cx('t-body-lg', styles.lead)}>
            USDC today against ZEC, BTC or SOL for 30, 60 or 90 days. Take the House Desk quote in a
            minute, or set your own repayment on the open market.
          </Reveal>
          <Reveal trigger="load" delay={0.8} className={styles.actions}>
            <ButtonLink href={APP_BORROW} as={Link} variant="inverse">
              Open App
            </ButtonLink>
            <ButtonLink
              href="/rates"
              as={Link}
              variant="secondary"
              showIcon
              className={styles.ghost}
            >
              See the Rates
            </ButtonLink>
          </Reveal>
          <Reveal trigger="load" delay={0.95} className={styles.proof}>
            <span>
              <SealCheckIcon weight="fill" size={16} />
              Live on NEAR Testnet
            </span>
            <span>
              <CoinsIcon weight="fill" size={16} />
              Zero Protocol Fee
            </span>
          </Reveal>
        </div>
        <Reveal trigger="load" delay={0.4} className={styles.quoteWrap}>
          <QuoteCard />
        </Reveal>
      </div>
    </section>
  );
}

/* 1. What a liquidation costs (Payouts > Fees). */

const MAX_SHARE = 40;

function share(value: string): number {
  return Number.parseFloat(value) / MAX_SHARE;
}

const BARS: readonly CompareRow[] = [
  {
    name: 'ZEC, Mosaec pawn',
    note: 'Ended below the repayment',
    value: R.pawnForfeit,
    ratio: share(R.pawnForfeit),
    best: true,
    badge: 'Lowest',
  },
  {
    name: 'ZEC, liquidating loan',
    note: 'Touched liquidation',
    value: R.liquidated,
    ratio: share(R.liquidated),
  },
  {
    name: 'BTC, Mosaec pawn',
    note: 'Ended below the repayment',
    value: '2.6%',
    ratio: share('2.6'),
    best: true,
  },
  {
    name: 'BTC, liquidating loan',
    note: 'Touched liquidation',
    value: '16.9%',
    ratio: share('16.9'),
  },
  {
    name: 'SOL, Mosaec pawn',
    note: 'Ended below the repayment',
    value: '11.4%',
    ratio: share('11.4'),
    best: true,
  },
  {
    name: 'SOL, liquidating loan',
    note: 'Touched liquidation',
    value: '34.0%',
    ratio: share('34.0'),
  },
];

function Cost() {
  return (
    <Section id="cost" label="What a liquidation really costs">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="1"
            shape={<TrendDownIcon weight="bold" size={16} color="var(--ill-mint)" />}
            label="Real Cost of a Loan"
          />
        }
        title={['The real price', 'of getting liquidated.']}
        lead={`The same loan held ${R.termDays.toString()} days at ${R.ltv} loan-to-value, started at every hour on record. Each bar is the share of start dates on which the borrower lost the coins.`}
      />
      <CompareBars
        rows={BARS}
        footnote={`Hourly closes from Binance and Bitfinex: ZEC ${R.span}, BTC 2013 to 2026, SOL 2020 to 2026. Pawn at 3% a month; loan liquidated at 80% loan-to-value. Measured ${R.measuredOn}.`}
      />
    </Section>
  );
}

/* 2. Journey (Payouts > Journey). */

const STEPS: readonly JourneyStep[] = [
  {
    stamp: 'Day 0',
    title: 'Pack',
    body: 'Mint a pack and drop your ZEC in. The pack is a NEAR account nobody holds a key to, the Mosaec team included.',
    icon: <LockKeyIcon weight="fill" />,
    color: 'ink',
  },
  {
    stamp: 'Day 0',
    title: 'Ask',
    body: 'Post the USDC you want and the repayment you offer, over 30, 60 or 90 days.',
    icon: <PaperPlaneTiltIcon weight="fill" />,
    color: 'blue',
  },
  {
    stamp: 'Day 0',
    title: 'Fill',
    body: 'A lender pays. The USDC and the Ticket land in your wallet; the Title goes to the lender.',
    icon: <HandCoinsIcon weight="fill" />,
    color: 'violet',
  },
  {
    stamp: 'Before day 90',
    title: 'Redeem',
    body: 'Pay the repayment while you hold the Ticket and the ZEC moves back to your account.',
    icon: <FlagIcon weight="fill" />,
    color: 'green',
  },
];

function Steps() {
  return (
    <Section id="journey" label="From pack to redeem">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="2"
            shape={<CalendarCheckIcon weight="fill" size={16} color="var(--ill-orange)" />}
            label="Journey"
          />
        }
        title={['Pack to cash', 'before your coffee cools.']}
        lead="Three calls on day zero put USDC in your wallet. One more, any day before the date, brings the coins back."
      />
      <Journey steps={STEPS} />
    </Section>
  );
}

/* 3. Sell the Ticket (Payouts > Bulk Payouts). */

function TicketRow({
  icon,
  label,
  sub,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly sub: string;
  readonly value: string;
}) {
  return (
    <li className={styles.listRow}>
      {icon}
      <div className={styles.listMain}>
        <span className="t-label">{label}</span>
        <span className="t-caption">{sub}</span>
      </div>
      <span className={styles.listValue}>{value}</span>
    </li>
  );
}

function TicketSale() {
  return (
    <div className={styles.listCard}>
      <div className={styles.listHead}>
        <span className="t-h5">Ticket sale · Pack #0</span>
        <StatusPill tone="positive">Transferred</StatusPill>
      </div>
      <ul>
        <TicketRow
          icon={
            <AppIcon color="orange" size={36}>
              <TicketIcon weight="fill" />
            </AppIcon>
          }
          label="Ticket"
          sub="Moves to the buyer"
          value="1 NFT"
        />
        <TicketRow
          icon={
            <AppIcon color="blue" size={36}>
              <CalendarCheckIcon weight="fill" />
            </AppIcon>
          }
          label="Date and repayment"
          sub="Carried over as they were"
          value="Same"
        />
        <TicketRow
          icon={
            <AppIcon color="green" size={36}>
              <HandCoinsIcon weight="fill" />
            </AppIcon>
          }
          label="USDC you borrowed"
          sub="Stays in your wallet"
          value="Yours"
        />
        <TicketRow
          icon={
            <AppIcon color="violet" size={36}>
              <ArrowsLeftRightIcon weight="bold" />
            </AppIcon>
          }
          label="Buyer pays you"
          sub="The gap between coins and repayment"
          value="Your price"
        />
      </ul>
    </div>
  );
}

function SellTicket() {
  return (
    <Section id="sell" label="Sell the Ticket">
      <div className={styles.split}>
        <Reveal className={styles.stage}>
          <TicketSale />
        </Reveal>
        <div className={styles.copy}>
          <Eyebrow
            badge="3"
            shape={<TicketIcon weight="fill" size={16} color="var(--ill-lime)" />}
            label="Ticket Market"
          />
          <WordReveal className="t-h1" lines={['Short of cash?', 'Sell the Ticket.']} />
          <Reveal as="p" className="t-body-lg" delay={0.2}>
            A Ticket is a standard NEAR NFT. Whoever holds it when the repayment lands receives the
            coins, so a buyer pays you for the value above the repayment.
          </Reveal>
          <Checks
            items={[
              'Transfers from any NEAR wallet',
              'The buyer inherits the date and the repayment',
              'The lender holding the Title sees no change',
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

/* 4. How a pawn ends (Payouts > Coverage). */

const STATUSES: readonly PawnStatus[] = [
  'Open',
  'Active',
  'Due Soon',
  'Grace',
  'Redeemed',
  'Forfeited',
];

function Endings() {
  return (
    <Section id="endings" label="How a pawn ends" className={styles.dark}>
      <div className={styles.darkHead}>
        <div className={styles.darkTitle}>
          <Reveal>
            <Tag
              badge="4"
              shape={<ScalesIcon weight="fill" size={16} color="var(--ill-lime)" />}
              tone="inverse"
            >
              Non-Recourse
            </Tag>
          </Reveal>
          <WordReveal className="t-h1" lines={['Missed the date?', 'The pack is the debt.']} />
        </div>
        <Reveal as="p" className={cx('t-body-lg', styles.darkLead)} delay={0.2}>
          At the date an unpaid Ticket voids and the lender keeps the coins. The USDC stays with you
          and nothing more is owed.
        </Reveal>
      </div>
      <Reveal className={styles.statusRow} delay={0.2}>
        <span className={cx('t-caption', styles.statusLabel)}>Every status a pawn shows</span>
        {STATUSES.map((status) => (
          <StatusPill key={status} tone={PAWN_STATUS[status].tone} icon={PAWN_STATUS[status].icon}>
            {PAWN_STATUS[status].label}
          </StatusPill>
        ))}
      </Reveal>
    </Section>
  );
}

const FAQ = [
  {
    q: 'Who lends to me?',
    a: 'The House Desk, the lender Mosaec runs, quotes a loan and repayment for your coins and fills in a minute. Or set your own repayment and any lender in the app, or any agent, can fill it within three days.',
  },
  {
    q: 'How much can I borrow?',
    a: 'On the open market you set the USDC you ask for and the repayment you offer, up to 1,000 USDC a pawn. The House Desk lends 10 to 250 USDC, up to half the coins\u2019 value. One pack holds up to 1 ZEC, 0.01 BTC or 5 SOL.',
  },
  {
    q: 'What if the verifier pauses near my date?',
    a: 'If the verifier is paused or locked in the last 24 hours before the date and anyone records it, your Ticket stays good for 24 hours past the date.',
  },
  {
    q: 'What happens when a fill goes wrong?',
    a: 'Fill, redeem and refunds settle through one receipt chain. Any mismatch refunds the lender in full with a typed reason such as E_TERMS, and your pack stays as it was.',
  },
  {
    q: 'Is borrowing live?',
    a: 'Mosaec runs on NEAR testnet with test ZEC, BTC, SOL and USDC. The mainnet registry is the next milestone, and the contracts have had an internal review.',
  },
] as const;

export default function BorrowPage() {
  return (
    <>
      <Hero />
      <Cost />
      <Steps />
      <SellTicket />
      <Endings />
      <FaqBlock title="Borrowing, answered." items={FAQ} />
    </>
  );
}
