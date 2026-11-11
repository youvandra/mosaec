import {
  ArrowsClockwiseIcon,
  BankIcon,
  CalendarCheckIcon,
  CubeIcon,
  HandCoinsIcon,
  LockKeyIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SparkleIcon,
  StackIcon,
  TrendUpIcon,
  UserIcon,
  VaultIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { DEFAULT_NETWORK, NETWORKS } from '@mosaec/config/networks';
import {
  AppIcon,
  ButtonLink,
  NftCard,
  Reveal,
  Section,
  StatusPill,
  Tag,
  WordReveal,
  cx,
} from '@mosaec/ui';

import { listOffers } from '../../../lib/api';
import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatUnits } from '../../../lib/format';
import { SITE } from '../../../lib/site';
import { Eyebrow, FaqBlock, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './lend.module.css';

import type { Amount, Pack } from '../../../lib/api';
import type { AppIconColor } from '@mosaec/ui';
import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const revalidate = 30;

export const metadata: Metadata = {
  title: 'Lend',
  description:
    'Lend USDC on NEAR against coins sealed in a keyless pack: a fixed repayment by a fixed date, or the coins themselves. No oracle, no liquidation race.',
};

/* Hero (Treasury > Hero): title row, then a grey panel with a big rate and floating cards. */

interface Floater {
  readonly label: string;
  readonly icon: ReactNode;
  readonly value: ReactNode;
  readonly sub: ReactNode;
  readonly pos: string;
  readonly dim?: boolean;
}

const FLOATERS: readonly Floater[] = [
  {
    label: 'Repayment due',
    icon: <CalendarCheckIcon weight="bold" size={14} />,
    value: `${E.repayment} USDC`,
    sub: <span className={styles.up}>By day {E.termDays}</span>,
    pos: styles.f1 ?? '',
  },
  {
    label: 'You paid',
    icon: <HandCoinsIcon weight="bold" size={14} />,
    value: `${E.principal} USDC`,
    sub: 'Title to you',
    pos: styles.f2 ?? '',
    dim: true,
  },
  {
    label: 'Collateral held',
    icon: <LockKeyIcon weight="bold" size={14} />,
    value: `${E.collateral} ZEC`,
    sub: 'In a keyless pack',
    pos: styles.f3 ?? '',
  },
  {
    label: 'Status',
    icon: <SealCheckIcon weight="bold" size={14} />,
    value: <StatusPill tone="positive">Active</StatusPill>,
    sub: `Day 31 of ${E.termDays.toString()}`,
    pos: styles.f4 ?? '',
  },
  {
    label: 'Price oracle',
    icon: <ShieldCheckIcon weight="bold" size={14} />,
    value: 'None',
    sub: 'The date decides',
    pos: styles.f5 ?? '',
    dim: true,
  },
];

const BAR_COUNT = 28;

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="lend-title">
      <div className={styles.heroTop}>
        <div className={styles.heroTitle}>
          <Reveal trigger="load" delay={0.1}>
            <Tag
              badge="Mosaec"
              shape={<SparkleIcon weight="fill" color="var(--ill-lime)" size={18} />}
            >
              Lend
            </Tag>
          </Reveal>
          <WordReveal
            as="h1"
            trigger="load"
            className="t-display"
            lines={['Lend against', { text: 'sealed coins.', className: 't-accent' }]}
          />
        </div>
        <div className={styles.heroSide}>
          <Reveal as="p" trigger="load" delay={0.5} className="t-body-lg">
            Pay USDC to a borrower and take the Title to their pack. The date brings you the
            repayment or the coins inside.
          </Reveal>
          <Reveal trigger="load" delay={0.7} className={styles.actions}>
            <ButtonLink href={SITE.appUrl} as={Link}>
              Browse Pawns
            </ButtonLink>
            <ButtonLink href="/rates" as={Link} variant="secondary" showIcon>
              See the Rates
            </ButtonLink>
          </Reveal>
        </div>
      </div>
      <Reveal trigger="load" delay={0.3} className={styles.board}>
        <span className={styles.boardGlow} aria-hidden="true" />
        <div className={styles.bars} aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, index) => (
            <span
              key={index}
              style={
                {
                  '--h': `${(10 + (index / (BAR_COUNT - 1)) ** 1.8 * 90).toFixed(1)}%`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className={styles.rate}>
          <span className={styles.rateValue}>{E.monthlyRate} a month</span>
          <span className={cx('t-body-sm', styles.rateNote)}>
            Suggested ZEC rate from the 11 Nov 2026 rate study. The borrower sets the price.
          </span>
        </div>
        {FLOATERS.map((card, index) => (
          <div
            key={card.label}
            className={cx(styles.floater, card.pos, card.dim === true && styles.dim)}
            style={{ '--float-delay': `${(-index * 0.7).toFixed(1)}s` } as CSSProperties}
          >
            <span className={styles.floaterLabel}>
              {card.icon}
              {card.label}
            </span>
            <span className={styles.floaterValue}>{card.value}</span>
            <span className={styles.floaterSub}>{card.sub}</span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

/* 1. Bento (Treasury > Bento). */

function PackLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.packLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Yield() {
  return (
    <Section id="yield" label="Yield without the oracle">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="1"
            shape={<TrendUpIcon weight="bold" size={16} color="var(--ill-orange)" />}
            label="Fixed Return"
          />
        }
        title={['Yield without', 'the oracle.']}
      />
      <div className={styles.bento}>
        <Reveal className={cx(styles.tile, styles.tileWide)}>
          <div className={styles.tileCopy}>
            <p className="t-h4">
              Every loan is backed by a sealed pack: a NEAR account with zero keys, holding the
              coins inside the verifier.
            </p>
            <ButtonLink href="/verify" as={Link} variant="secondary" size="sm" showIcon>
              Verify a Pack
            </ButtonLink>
          </div>
          <div className={styles.packCard}>
            <div className={styles.packHead}>
              <span className="t-label">What backs the loan</span>
              <StatusPill tone="neutral" dot={false}>
                Sealed
              </StatusPill>
            </div>
            <PackLine label="Access keys" value="0" />
            <PackLine label="Contents" value="Committed by hash" />
            <PackLine label="Moves on" value="Payment or date" />
          </div>
        </Reveal>
        <Reveal className={styles.tile} delay={0.15}>
          <div className={styles.console}>
            <div className={styles.consoleRow}>
              <span className="t-mono">Repaid before the date</span>
              <strong>You get the USDC repayment</strong>
            </div>
            <div className={styles.consoleRow}>
              <span className="t-mono">Missed the date</span>
              <strong>You keep the coins</strong>
            </div>
          </div>
          <p className="t-body">
            Two outcomes, both written into the pack. A price drop changes neither of them.
          </p>
        </Reveal>
        <Reveal className={styles.tile} delay={0.25}>
          <div className={styles.titleStage}>
            <NftCard
              kind="title"
              tokenLabel="Pack #0"
              value="Owns the pack"
              meta="Standard NEAR NFT"
              icon={<VaultIcon size={22} weight="fill" />}
              className={styles.titleCard}
            />
          </div>
          <p className="t-body">
            Need the cash back early? Sell the Title. Whoever holds it on the date collects.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

/* 2. Numbers (Treasury > Numbers). */

interface Figure {
  readonly value: string;
  readonly label: string;
  readonly lit: readonly number[];
  readonly tall?: boolean;
}

const FIGURES: readonly Figure[] = [
  { value: '0', label: 'Protocol fee on a fill', lit: [3, 8, 9, 12] },
  { value: '1,000 USDC', label: 'Most one fill pays in this release', lit: [1, 4, 5, 6, 10, 11] },
  { value: '30 · 60 · 90', label: 'Term options in the app, in days', lit: [2, 7, 13, 14] },
  {
    value: '1 ZEC',
    label: 'Most collateral one pack holds, with 0.01 BTC and 5 SOL',
    lit: [0, 5, 6, 9, 15],
  },
];

function Dots({ lit }: { readonly lit: readonly number[] }) {
  return (
    <span className={styles.dots} aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => (
        <span key={index} className={cx(lit.includes(index) && styles.dotLit)} />
      ))}
    </span>
  );
}

function Numbers() {
  return (
    <Section id="numbers" label="What a fill does">
      <SectionIntro
        layout="split"
        eyebrow={
          <Eyebrow
            badge="2"
            shape={<StackIcon weight="fill" size={16} color="var(--ill-mint)" />}
            label="The Numbers"
          />
        }
        title={['What a fill does.']}
        lead="One call pays the borrower, checks the terms against the pack and hands you the Title. Any mismatch refunds you in full with a typed reason."
      />
      <Reveal className={styles.numbers}>
        {FIGURES.map((figure) => (
          <div key={figure.label} className={styles.number}>
            <div className={styles.numberText}>
              <span className="t-h2">{figure.value}</span>
              <span className="t-body-sm">{figure.label}</span>
            </div>
            <Dots lit={figure.lit} />
          </div>
        ))}
      </Reveal>
    </Section>
  );
}

/* 3. Custody (Treasury > Custody). */

interface Hop {
  readonly title: string;
  readonly sub: string;
  readonly icon: ReactNode;
  readonly color: AppIconColor;
}

function hops(): readonly Hop[] {
  const network = NETWORKS[DEFAULT_NETWORK];
  return [
    {
      title: 'You, the lender',
      sub: 'Pay USDC from your NEAR account',
      icon: <UserIcon weight="fill" />,
      color: 'light',
    },
    {
      title: 'Registry',
      sub: `${network.registryAccountId}, checks the terms`,
      icon: <CubeIcon weight="fill" />,
      color: 'lime',
    },
    {
      title: 'Pack',
      sub: 'Keyless sub-account, owned by your Title',
      icon: <LockKeyIcon weight="fill" />,
      color: 'mint',
    },
    {
      title: 'Verifier',
      sub: `${network.verifierAccountId}, holds the balances`,
      icon: <BankIcon weight="fill" />,
      color: 'orange',
    },
  ];
}

function Custody() {
  return (
    <Section id="custody" label="Where the coins sit" className={styles.dark}>
      <div className={styles.custody}>
        <div className={styles.custodyCopy}>
          <Reveal>
            <Tag
              badge="3"
              shape={<ShieldCheckIcon weight="fill" size={16} color="var(--ill-coral)" />}
              tone="inverse"
            >
              Where the Coins Sit
            </Tag>
          </Reveal>
          <WordReveal className="t-h1" lines={['Held by code,', 'every step of the way.']} />
          <Reveal as="p" className={cx('t-body-lg', styles.darkLead)} delay={0.2}>
            Mosaec never takes custody. Your USDC goes straight to the borrower, and the coins stay
            in the pack until the repayment or the date moves them.
          </Reveal>
        </div>
        <Reveal className={styles.chain} delay={0.15}>
          {hops().map((hop) => (
            <div key={hop.title} className={styles.hop}>
              <AppIcon color={hop.color} size={36}>
                {hop.icon}
              </AppIcon>
              <div className={styles.hopText}>
                <span className="t-label">{hop.title}</span>
                <span className="t-caption">{hop.sub}</span>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}

/* 4. Open pawns from the live offer feed. */

const NS_PER_DAY = 86_400_000_000_000n;

function amountText(amount: Amount): string {
  const value =
    amount.decimals === null ? amount.amount : formatUnits(amount.amount, amount.decimals, 4);
  return `${value} ${amount.symbol ?? ''}`.trim();
}

function OfferRow({ pack }: { readonly pack: Pack }) {
  const first = pack.contents[0];
  const symbol = first?.symbol;
  const mark =
    symbol === 'BTC' || symbol === 'SOL' || symbol === 'ZEC' ? ASSET_MARK[symbol] : ASSET_MARK.ZEC;
  const termNs = pack.terms?.termNs;
  const days = termNs === null || termNs === undefined ? null : BigInt(termNs) / NS_PER_DAY;
  return (
    <li className={styles.offer}>
      <AppIcon color="light" size={40} mark>
        <Image src={mark} alt="" width={24} height={24} />
      </AppIcon>
      <div className={styles.offerMain}>
        <span className="t-label">
          Pack #{pack.index} · {first === undefined ? 'Empty' : amountText(first)}
        </span>
        <span className="t-caption">
          {pack.offer === null ? 'Price pending' : `Pay ${amountText(pack.offer.price)}`}
          {pack.terms === null ? '' : `, get ${amountText(pack.terms.repayment)}`}
        </span>
      </div>
      <StatusPill tone="accent" dot={false}>
        {days === null ? 'Open' : days > 0n ? `${days.toString()} Days` : 'Short Term'}
      </StatusPill>
    </li>
  );
}

const SHOWN = 4;

async function OfferList() {
  const offers = await listOffers(DEFAULT_NETWORK, 20).catch(() => null);
  const shown = offers?.slice(0, SHOWN) ?? null;
  return (
    <div className={styles.offerCard}>
      <div className={styles.offerHead}>
        <span className="t-h5">Open pawns</span>
        <StatusPill tone="positive">Live</StatusPill>
      </div>
      {shown === null ? (
        <p className={cx('t-body-sm', styles.offerEmpty)}>
          The offer feed is unavailable right now. Open pawns stay listed in the app.
        </p>
      ) : shown.length === 0 ? (
        <p className={cx('t-body-sm', styles.offerEmpty)}>
          Every offer is filled right now. New asks appear here seconds after they are posted.
        </p>
      ) : (
        <ul>
          {shown.map((pack) => (
            <OfferRow key={pack.id} pack={pack} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OpenPawns() {
  return (
    <Section id="open" label="Open pawns">
      <div className={styles.split}>
        <div className={styles.splitCopy}>
          <Eyebrow
            badge="4"
            shape={<ArrowsClockwiseIcon weight="bold" size={16} color="var(--ill-violet)" />}
            label="Open Pawns"
          />
          <WordReveal className="t-h1" lines={['Pick a pawn.', 'Fill it in one call.']} />
          <Reveal as="p" className="t-body-lg" delay={0.2}>
            Each ask shows its coins, the USDC it wants and the repayment it offers. These come
            straight from the NEAR testnet feed.
          </Reveal>
          <Reveal delay={0.3}>
            <ButtonLink href={SITE.appUrl} as={Link} showIcon>
              Browse Open Pawns
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal className={styles.stage}>
          <OfferList />
        </Reveal>
      </div>
    </Section>
  );
}

const FAQ = [
  {
    q: 'Who sets the rate?',
    a: 'The borrower, in the ask. The app suggests a rate per asset and term from a study of every price window on record, and you fill only the asks whose terms you like.',
  },
  {
    q: 'What if a fill goes wrong?',
    a: 'Fill, redeem and refunds settle through one receipt chain. If the pack, the terms or the payment disagree, the USDC returns to you in full with a code such as E_TERMS or E_EXPIRED.',
  },
  {
    q: 'Do I carry the price risk?',
    a: 'Yes, below the repayment. If the coins are worth less than the repayment on the date, the borrower lets the Ticket lapse and you hold the coins. A lower loan-to-value gives you a wider cushion.',
  },
  {
    q: 'Is there an automated lender?',
    a: 'A house lending desk is in development: a budget-capped agent that reads open asks and fills those inside a policy the server enforces. Today any agent can read the API and build exact fill calls with the SDK.',
  },
] as const;

export default function LendPage() {
  return (
    <>
      <Hero />
      <Yield />
      <Numbers />
      <Custody />
      <OpenPawns />
      <FaqBlock title="Lending, answered." items={FAQ} />
    </>
  );
}
