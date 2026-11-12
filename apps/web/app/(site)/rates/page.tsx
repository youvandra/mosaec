import {
  ChartBarIcon,
  CheckIcon,
  ReceiptIcon,
  ScalesIcon,
  SparkleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon, Reveal, Section, Tag, WordReveal, cx } from '@mosaec/ui';

import { ASSET_MARK, markFill } from '../../../lib/asset-marks';
import { formatUnits, padCents } from '../../../lib/format';
import { SUGGESTED_MONTHLY_RATE_BPS, TERM_OPTIONS, suggestedRepayment } from '../../../lib/rates';
import { Eyebrow, FaqBlock, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import { RatePlans } from './RatePlans';
import styles from './rates.module.css';

import type { AssetPlans, PlanTerm } from './RatePlans';
import type { AssetSymbol } from '@mosaec/config/assets';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rates',
  description:
    'Suggested Mosaec pawn rates for ZEC, BTC and SOL at 50% loan-to-value over 30, 60 and 90 days, the fees you pay, and how a pawn compares with liquidating loans.',
};

const USDC_DECIMALS = ASSETS.USDC.decimals;
const PRINCIPAL = BigInt(E.principal.replace('.', '')) * 10n ** BigInt(USDC_DECIMALS - 2);
const PLAN_ASSETS: readonly AssetSymbol[] = ['ZEC', 'BTC', 'SOL'];

const TERM_COPY: Readonly<Record<string, Omit<PlanTerm, 'repayment' | 'days'>>> = {
  d30: {
    dot: 'var(--ill-orange)',
    featured: false,
    blurb: 'A short bridge for a known expense, with the smallest repayment.',
    checks: [
      'Repay on any day before day 30',
      'Same repayment whatever day you pay',
      'Ticket sellable at any point',
    ],
  },
  d60: {
    dot: 'var(--ill-violet)',
    featured: false,
    blurb: 'Two months of room for the coins to move before you decide.',
    checks: [
      'Repay on any day before day 60',
      'Same repayment whatever day you pay',
      'Ticket sellable at any point',
    ],
  },
  d90: {
    dot: 'var(--ill-lime)',
    featured: true,
    blurb: 'The term the rate study leads with, and the most time for the coins to recover.',
    checks: [
      'Repay on any day before day 90',
      'Same repayment whatever day you pay',
      'Ticket sellable at any point',
      'Priced from every 90-day window on record',
    ],
  },
};

const NS_PER_DAY = 86_400_000_000_000n;

function plansFor(symbol: AssetSymbol): AssetPlans {
  const rate = SUGGESTED_MONTHLY_RATE_BPS[symbol] ?? 0;
  const terms = TERM_OPTIONS.filter((option) => option.testnetOnly !== true).flatMap((option) => {
    const copy = TERM_COPY[option.id];
    if (copy === undefined) return [];
    const repayment = suggestedRepayment(PRINCIPAL, rate, option.termNs);
    return [
      {
        ...copy,
        days: Number(option.termNs / NS_PER_DAY),
        repayment: padCents(formatUnits(repayment, USDC_DECIMALS, 2)),
      },
    ];
  });
  return { symbol, terms };
}

function bpsText(bps: number | undefined): string {
  return bps === undefined ? '' : `${(bps / 100).toString()}%`;
}

/* Hero (Pricing > Hero) and plans (Pricing > Plans). */

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="rates-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.heroCopy}>
        <Reveal trigger="load" delay={0.1}>
          <Tag
            badge="Mosaec"
            shape={<SparkleIcon weight="fill" color="var(--ill-lime)" size={18} />}
          >
            Rates
          </Tag>
        </Reveal>
        <WordReveal
          id="rates-title"
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Rates set by', { text: 'the date alone.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.55} className={cx('t-body-lg', styles.lead)}>
          Each pawn carries one repayment and one date, fixed at the fill. The figures below are
          suggestions from the 11 Nov 2026 rate study; the borrower sets the final price.
        </Reveal>
      </div>
      <div className={styles.plansWrap}>
        <RatePlans assets={PLAN_ASSETS.map(plansFor)} principal={E.principal} href="/app/borrow" />
      </div>
    </section>
  );
}

/* 1. Compare (Pricing > Compare). */

const COLUMNS = ['Mosaec Pawn', 'Pooled Lending', 'Exchange Margin'] as const;

const COMPARE: readonly {
  readonly label: string;
  readonly cells: readonly [string, string, string];
}[] = [
  { label: 'Price oracle', cells: ['None', 'Price feed', 'Mark price'] },
  {
    label: 'Liquidation',
    cells: ['None, the date decides', 'At a health threshold', 'At maintenance margin'],
  },
  {
    label: 'Rate',
    cells: [
      'Fixed repayment, set by the borrower',
      'Floating, set by pool use',
      'Set by the exchange',
    ],
  },
  {
    label: 'Collateral custody',
    cells: ['Keyless pack on NEAR', 'Pool contract', 'Exchange account'],
  },
  {
    label: 'Worst case',
    cells: [
      'The coins in the pack',
      'Collateral sold at the low, plus a penalty',
      'Position closed at the low',
    ],
  },
  {
    label: 'Size per position',
    cells: ['1 ZEC, 0.01 BTC or 5 SOL', 'Pool limits', 'Exchange tiers'],
  },
];

function Compare() {
  return (
    <Section id="compare" label="Compare">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="1"
            shape={<ScalesIcon weight="fill" size={16} color="var(--ill-mint)" />}
            label="Compare"
          />
        }
        title={['Three ways to borrow,', 'side by side.']}
      />
      <Reveal className={styles.tableWrap}>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Feature</span>
              </th>
              {COLUMNS.map((column, index) => (
                <th key={column} scope="col" className={cx(index === 0 && styles.ours)}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, index) => (
                  <td key={COLUMNS[index]} className={cx(index === 0 && styles.oursCell)}>
                    {index === 0 && (
                      <span className={styles.tick} aria-hidden="true">
                        <CheckIcon weight="bold" size={11} />
                      </span>
                    )}
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </Section>
  );
}

/* 2. Fees (Pricing > Fees). */

const FEES = [
  { label: 'Protocol fee', sub: 'On every fill, redeem and claim', value: '0' },
  { label: 'NEAR gas', sub: 'Paid by whoever sends the call', value: 'Per call' },
  {
    label: 'Verifier fee',
    sub: 'Charged by NEAR Intents where it applies',
    value: 'Set by the verifier',
  },
  { label: 'Bridge fee', sub: 'On withdrawal to the home chain', value: 'Set by the bridge' },
  { label: 'Interest', sub: 'The gap between the USDC and the repayment', value: 'Your price' },
] as const;

function Fees() {
  return (
    <Section id="fees" label="Fees" className={styles.grey}>
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="2"
            shape={<ReceiptIcon weight="fill" size={16} color="var(--ill-lime)" />}
            label="Fees"
          />
        }
        title={['Every fee,', 'zero fine print.']}
        lead="Mosaec keeps nothing from a pawn. What you pay goes to the network, the bridge or the other side of the loan."
      />
      <Reveal className={styles.fees}>
        <div className={styles.feeList}>
          <span className={cx('t-label', styles.feeHead)}>What you pay for</span>
          {FEES.map((fee) => (
            <div key={fee.label} className={styles.feeRow} data-value={fee.value}>
              <span className={styles.feeTick}>
                <CheckIcon weight="bold" size={12} />
              </span>
              <div>
                <div className="t-label">{fee.label}</div>
                <div className="t-caption">{fee.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.feeValues}>
          <span className={cx('t-label', styles.feeBrand)}>
            <SparkleIcon weight="fill" size={14} />
            Mosaec
          </span>
          {FEES.map((fee) => (
            <span key={fee.label} className={styles.feeValue}>
              {fee.value}
            </span>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

/* 3. Per-asset table (Treasury > Earnings rhythm). */

const HISTORY: Readonly<
  Partial<Record<AssetSymbol, { span: string; forfeit: string; liquidated: string }>>
> = {
  ZEC: { span: '2017 to 2026', forfeit: '10.7%', liquidated: '34.6%' },
  BTC: { span: '2013 to 2026', forfeit: '2.6%', liquidated: '16.9%' },
  SOL: { span: '2020 to 2026', forfeit: '11.4%', liquidated: '34.0%' },
};

function PerAsset() {
  return (
    <Section id="assets" label="Rates per asset">
      <SectionIntro
        layout="split"
        eyebrow={
          <Eyebrow
            badge="3"
            shape={<ChartBarIcon weight="fill" size={16} color="var(--ill-orange)" />}
            label="Per Asset"
          />
        }
        title={['Priced from', 'every window on record.']}
        lead="Suggested monthly rates at 50% loan-to-value, beside how often a 90-day pawn and a liquidating loan cost the borrower the coins."
      />
      <Reveal className={styles.tableWrap}>
        <table className={styles.assets}>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Suggested Rate</th>
              <th scope="col">Pawn Below Repayment</th>
              <th scope="col">Loan Liquidated</th>
              <th scope="col">Price History</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_ASSETS.map((symbol) => {
              const history = HISTORY[symbol];
              return (
                <tr key={symbol}>
                  <th scope="row">
                    <span className={styles.assetName}>
                      <AppIcon color="light" size={36} mark fill={markFill(ASSET_MARK[symbol])}>
                        <Image src={ASSET_MARK[symbol]} alt="" width={22} height={22} />
                      </AppIcon>
                      {symbol}
                    </span>
                  </th>
                  <td className={styles.rateCell}>
                    {bpsText(SUGGESTED_MONTHLY_RATE_BPS[symbol])} a month
                  </td>
                  <td className={styles.good}>{history?.forfeit}</td>
                  <td>{history?.liquidated}</td>
                  <td className={styles.muted}>{history?.span}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Reveal>
      <Reveal as="p" className={cx('t-caption', styles.footnote)}>
        Hourly closes from Binance and Bitfinex, every 90-day start hour. Pawn at 3% a month; loan
        liquidated at 80% loan-to-value. Measured 11 Nov 2026. Makers set their own terms.
      </Reveal>
    </Section>
  );
}

const FAQ = [
  {
    q: 'Who sets the rate?',
    a: 'The borrower, in the ask. A lender fills the asks whose terms suit them, so the market finds the price; the suggestions here are a starting point.',
  },
  {
    q: 'How were the suggestions computed?',
    a: 'A block bootstrap of daily returns over each asset’s full history, run with and without the historical trend. The suggestion is the larger of the two break-even rates plus half a percent a month, rounded up to a quarter.',
  },
  {
    q: 'Why does ZEC cost more than BTC?',
    a: 'ZEC moves more. Its realised volatility was 133% over the last year and 116% since 2017, against 44% and 76% for BTC (daily closes, annualised).',
  },
  {
    q: 'Why 50% loan-to-value?',
    a: 'It balances cash in hand against the lender’s cushion. A lower ratio earns a lower rate: the study suggests 1.5% a month for ZEC over 90 days at 40%.',
  },
] as const;

export default function RatesPage() {
  return (
    <>
      <Hero />
      <Compare />
      <Fees />
      <PerAsset />
      <FaqBlock title="Rates, answered." items={FAQ} />
    </>
  );
}
