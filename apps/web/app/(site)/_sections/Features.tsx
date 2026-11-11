import { PlusIcon, SquaresFourIcon, StampIcon, TicketIcon } from '@phosphor-icons/react/dist/ssr';

import { NftCard, Reveal, Section, StatusPill, cx } from '@mosaec/ui';

import { Eyebrow, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './Features.module.css';

import type { ReactNode } from 'react';

const TERM_BARS = [22, 30, 38, 46, 54, 62, 70, 78, 86, 100];

const CARDS: readonly { eyebrow: string; title: string; visual: ReactNode }[] = [
  {
    eyebrow: 'Seal your coins in a',
    title: 'Keyless Pack',
    visual: (
      <div className={styles.rows}>
        <div className={styles.row}>
          <span>Zcash</span>
          <span>{E.collateral} ZEC</span>
        </div>
        <div className={styles.row}>
          <span>Access keys</span>
          <span>0</span>
        </div>
        <div className={styles.row}>
          <span>Contract</span>
          <span>Immutable</span>
        </div>
        <div className={cx(styles.row, styles.fade)}>
          <span>Oracle</span>
          <span>None</span>
        </div>
      </div>
    ),
  },
  {
    eyebrow: 'Ownership lives in the',
    title: 'Title NFT',
    visual: (
      <div className={styles.mini}>
        <span className="t-caption">Owner of pack #0</span>
        <span className="t-h4">{E.collateral} ZEC</span>
        <StatusPill tone="positive">Transferable</StatusPill>
      </div>
    ),
  },
  {
    eyebrow: 'Your way back is the',
    title: 'Ticket NFT',
    visual: (
      <div className={styles.stack} aria-hidden="true">
        <NftCard
          className={styles.s1}
          kind="ticket"
          tokenLabel="#2"
          value="537.50 USDC"
          notch="var(--bg-secondary)"
          icon={<TicketIcon size={20} weight="fill" />}
        />
        <NftCard
          className={styles.s2}
          kind="title"
          tokenLabel="#1"
          value="1.00 ZEC"
          icon={<StampIcon size={20} weight="fill" />}
        />
        <NftCard
          className={styles.s3}
          kind="ticket"
          tokenLabel="#0"
          value="537.50 USDC"
          tone="lime"
          notch="var(--bg-secondary)"
          icon={<TicketIcon size={20} weight="fill" />}
        />
      </div>
    ),
  },
  {
    eyebrow: 'Settled by one',
    title: 'Fixed Date',
    visual: (
      <div className={styles.mini}>
        <span className="t-caption">Term · {E.termDays.toString()} days</span>
        <span className="t-h4">{E.repayment} USDC</span>
        <div className={styles.bars} aria-hidden="true">
          {TERM_BARS.map((h, i) => (
            <span
              key={h}
              className={cx(styles.bar, i === TERM_BARS.length - 1 && styles.barLast)}
              style={{ height: `${h.toString()}%` }}
            />
          ))}
        </div>
      </div>
    ),
  },
];

export function Features() {
  return (
    <Section id="parts" label="The parts of a pawn">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="1"
            shape={<SquaresFourIcon weight="fill" size={16} color="var(--ill-lime)" />}
            label="Primitive"
          />
        }
        title={['Four Parts, One Pawn']}
        lead="A sealed pack, two NFTs that split it and a date that settles it. Every loan on Mosaec is built from these four pieces."
      />
      <div className={styles.grid}>
        {CARDS.map((card, index) => (
          <Reveal key={card.title} className={styles.card} delay={0.08 * index}>
            <span className={styles.eyebrow}>{card.eyebrow}</span>
            <h3 className="t-h4">{card.title}</h3>
            <div className={styles.stage}>{card.visual}</div>
            <span className={styles.plus} aria-hidden="true">
              <PlusIcon size={14} weight="bold" />
            </span>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
