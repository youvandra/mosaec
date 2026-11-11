import {
  CheckIcon,
  CubeIcon,
  RobotIcon,
  StampIcon,
  TicketIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon, NftCard, ProgressBar, Section, StatusPill, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatUnits } from '../../../lib/format';
import { Bento, BentoTile, Eyebrow, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './Suite.module.css';

import type { AssetSymbol } from '@mosaec/config/assets';
import type { CSSProperties, ReactNode } from 'react';

const RULES: readonly string[] = [
  'Zero oracle',
  'Zero liquidation',
  'One receipt chain',
  'Protocol fee 0',
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
          <AppIcon color="light" size={32} mark>
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
              <AppIcon color="green" size={22}>
                <CheckIcon weight="bold" />
              </AppIcon>
              {rule}
            </Chip>
          ))}
        </div>
        <div className={cx(styles.chipRow, styles.reverse)}>
          {[...SYMBOLS, ...SYMBOLS, ...SYMBOLS].map((symbol, i) => (
            <Chip key={i}>
              <Image src={ASSET_MARK[symbol]} alt="" width={22} height={22} />
              {symbol}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function TicketVisual() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className={styles.cardStack} aria-hidden="true">
        <div className={styles.f1} style={{ '--r': '-6deg' } as CSSProperties}>
          <NftCard
            kind="ticket"
            tone="lime"
            tokenLabel="#2"
            value={`${E.repayment} USDC`}
            notch="var(--bg-secondary)"
            icon={<TicketIcon size={20} weight="fill" />}
          />
        </div>
        <div className={styles.f2} style={{ '--r': '4deg' } as CSSProperties}>
          <NftCard
            kind="ticket"
            tokenLabel="#1"
            value={`${E.repayment} USDC`}
            notch="var(--bg-secondary)"
            icon={<TicketIcon size={20} weight="fill" />}
          />
        </div>
        <div className={styles.f3} style={{ '--r': '-3deg' } as CSSProperties}>
          <NftCard
            kind="title"
            tokenLabel="#0"
            value={`${E.collateral} ZEC`}
            icon={<StampIcon size={20} weight="fill" />}
          />
        </div>
      </div>
      <div className={styles.limit}>
        <ProgressBar
          label="Term elapsed"
          valueText={`31 of ${E.termDays.toString()} days`}
          ratio={31 / E.termDays}
        />
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
          <StatusPill tone="positive" dot>
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
    href: '/borrow#ticket',
    title: 'Tickets',
    body: 'Your right to buy the coins back, tradable like any NFT.',
    size: 'tall',
    visual: <TicketVisual />,
  },
  {
    href: '/lend',
    title: 'Collateral',
    body: 'Native coins in NEAR Intents, capped per pack.',
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
    href: '/agents',
    title: 'Agents',
    body: 'Rules simple enough for software to price.',
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
        title={['A full pawn desk,', 'built on one contract.']}
        lead="Borrowers, lenders, Ticket traders and agents all meet the same sealed pack. Start with one side and add the rest when you need it."
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
