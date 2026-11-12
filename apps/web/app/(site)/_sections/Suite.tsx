import { CheckIcon, CubeIcon, RobotIcon } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon, Section, StatusPill, cx } from '@mosaec/ui';

import { ASSET_MARK, TICKER_MARKS, markFill } from '../../../lib/asset-marks';
import { formatUnits } from '../../../lib/format';
import { SUGGESTED_MONTHLY_RATE_BPS } from '../../../lib/rates';
import { Bento, BentoTile, Eyebrow, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './Suite.module.css';

import type { AssetSymbol } from '@mosaec/config/assets';
import type { ReactNode } from 'react';

const RULES: readonly string[] = [
  'Zero oracle',
  'Zero liquidation',
  'All-or-nothing fills',
  'Zero protocol fee',
  '24 h grace',
];

const SYMBOLS: readonly AssetSymbol[] = ['ZEC', 'BTC', 'SOL', 'USDC'];

function Chip({ children }: { readonly children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

function BorrowVisual() {
  return (
    <div className={styles.quote}>
      <div className={styles.offer}>
        <div className={styles.offerHead}>
          <AppIcon color="light" size={32} mark fill={markFill(ASSET_MARK.ZEC)}>
            <Image src={ASSET_MARK.ZEC} alt="" width={20} height={20} />
          </AppIcon>
          <div>
            <div className="t-label">Pack #0</div>
            <div className="t-caption">{E.collateral} ZEC sealed</div>
          </div>
        </div>
        <span className={styles.btnInk}>Ask {E.principal} USDC</span>
        <span className={styles.btnBlue}>Repay {E.repayment} USDC</span>
      </div>
      <div className={styles.chips} aria-hidden="true">
        <div className={styles.chipRow}>
          {[...RULES, ...RULES].map((rule, i) => (
            <Chip key={i}>
              <AppIcon color="green" size={32}>
                <CheckIcon weight="bold" />
              </AppIcon>
              {rule}
            </Chip>
          ))}
        </div>
        <div className={cx(styles.chipRow, styles.reverse)}>
          {[...TICKER_MARKS, ...TICKER_MARKS, ...TICKER_MARKS, ...TICKER_MARKS].map((mark, i) => (
            <Chip key={i}>
              <AppIcon color="light" size={32} mark fill={markFill(mark.src)}>
                <Image src={mark.src} alt="" width={20} height={20} />
              </AppIcon>
              {mark.symbol}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

const RATE_ASSETS: readonly AssetSymbol[] = ['ZEC', 'BTC', 'SOL'];

/** Rate cards stacked like the source's Cards tile, with one worked repayment underneath. */
function RatesVisual() {
  const tones = [styles.rateLime, styles.rateBlue, styles.rateInk];
  return (
    <div className={styles.rates}>
      <div className={styles.rateStack}>
        {RATE_ASSETS.map((symbol, index) => (
          <div key={symbol} className={cx(styles.rateCard, tones[index])}>
            <span className={styles.rateHead}>
              <Image src={ASSET_MARK[symbol]} alt="" width={22} height={22} />
              {symbol}
            </span>
            <span className={styles.rateFig}>
              {((SUGGESTED_MONTHLY_RATE_BPS[symbol] ?? 0) / 100).toString()}%
              <span className={styles.rateUnit}>a month</span>
            </span>
          </div>
        ))}
      </div>
      <div className={styles.rateNote}>
        <span className={styles.rateNoteRow}>
          <span className="t-caption">500 USDC, 90 days</span>
          <span className="t-label">Repay 537.50</span>
        </span>
        <span className={styles.rateBar} aria-hidden="true">
          <span />
        </span>
      </div>
    </div>
  );
}

function LendVisual() {
  return (
    <div className={styles.list}>
      {SYMBOLS.map((symbol) => (
        <div key={symbol} className={styles.listRow}>
          <Image src={ASSET_MARK[symbol]} alt="" width={24} height={24} />
          <span>{ASSETS[symbol].name}</span>
          <span>
            {formatUnits(ASSETS[symbol].capPerPack, ASSETS[symbol].decimals)} {symbol}
          </span>
        </div>
      ))}
    </div>
  );
}

function VerifyVisual() {
  return (
    <div className={styles.list}>
      {['Zero access keys', 'Published code hash', 'Unlocked at the verifier'].map((check) => (
        <div key={check} className={styles.listRow}>
          <StatusPill tone="positive" icon={CheckIcon}>
            Pass
          </StatusPill>
          <span>{check}</span>
          <span />
        </div>
      ))}
    </div>
  );
}

function YieldVisual() {
  const heights = [34, 40, 48, 52, 60, 68, 76, 100];
  return (
    <div className={styles.yield}>
      <div className={styles.yieldHead}>
        <span className="t-h3">{E.repayment}</span>
        <StatusPill tone="positive" dot={false}>
          {`+${E.monthlyRate} / mo`}
        </StatusPill>
      </div>
      <span className="t-caption">USDC due at the end of the term</span>
      <div className={styles.ybars} aria-hidden="true">
        {heights.map((h) => (
          <span key={h} className={styles.ybar} style={{ height: `${h.toString()}%` }} />
        ))}
      </div>
    </div>
  );
}

function AgentVisual() {
  return (
    <div className={styles.chat}>
      <span className={styles.bubble}>Find a 90-day ZEC pawn that repays at least 7%.</span>
      <div className={styles.answer}>
        <span className="t-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <RobotIcon size={16} weight="fill" color="var(--ill-orange)" />
          One offer matches. Filling it is a single <code>fill</code> call.
        </span>
        <div className={styles.results}>
          <span className={styles.result}>
            Collateral
            <strong>{E.collateral} ZEC</strong>
          </span>
          <span className={styles.result}>
            Repays
            <strong>{E.repayment} USDC</strong>
          </span>
          <span className={styles.result}>
            Return
            <strong>+7.5%</strong>
          </span>
        </div>
        <span className="t-caption">Worked example</span>
      </div>
    </div>
  );
}

const TILES: readonly {
  href: string;
  title: string;
  body: string;
  size?: 'wide' | 'tall';
  visual: ReactNode;
}[] = [
  {
    href: '/borrow',
    title: 'Borrow',
    body: 'Seal coins, name the loan and sign it from any NEAR wallet.',
    size: 'wide',
    visual: <BorrowVisual />,
  },
  {
    href: '/rates',
    title: 'Rates',
    body: 'Priced from every 90-day window on record.',
    size: 'tall',
    visual: <RatesVisual />,
  },
  {
    href: '/lend',
    title: 'Collateral',
    body: 'Real ZEC, BTC and SOL, held through NEAR Intents.',
    visual: <LendVisual />,
  },
  {
    href: '/lend',
    title: 'Lend',
    body: 'A fixed repayment, set before you pay.',
    visual: <YieldVisual />,
  },
  {
    href: '/verify',
    title: 'Verify',
    body: 'Your browser checks the chain directly.',
    visual: <VerifyVisual />,
  },
  {
    href: '/agents/connect',
    title: 'Your Agent',
    body: 'Rules simple enough for your agent to lend on.',
    size: 'wide',
    visual: <AgentVisual />,
  },
];

export function Suite() {
  return (
    <Section id="suite" label="Products">
      <SectionIntro
        layout="split"
        eyebrow={
          <Eyebrow
            badge="2"
            shape={<CubeIcon weight="fill" size={16} color="var(--ill-mint)" />}
            label="Products"
          />
        }
        title={['Borrow, lend, verify.', 'One contract runs it all.']}
        lead="Borrowers, lenders and agents all meet at the same sealed pack. Start from any side."
      />
      <Bento>
        {TILES.map((tile) => (
          <Link key={tile.title} href={tile.href} className={styles.link}>
            <BentoTile
              title={tile.title}
              body={tile.body}
              {...(tile.size === undefined ? {} : { size: tile.size })}
            >
              {tile.visual}
            </BentoTile>
          </Link>
        ))}
      </Bento>
    </Section>
  );
}
