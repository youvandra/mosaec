import {
  CalendarCheckIcon,
  LockKeyIcon,
  SparkleIcon,
  TicketIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { ButtonLink, AppIcon, Reveal, Tag, WordReveal, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { SITE } from '../../../lib/site';

import styles from './Hero.module.css';
import { ProductFolder } from './ProductFolder';

import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

interface HangingTile {
  readonly slot: string;
  readonly color: AppIconColor;
  readonly mark?: boolean;
  readonly label: string;
  readonly content: ReactNode;
}

function mark(src: string) {
  return <Image src={src} alt="" width={40} height={40} priority />;
}

const TILES: readonly HangingTile[] = [
  {
    slot: styles.h1 ?? '',
    color: 'light',
    mark: true,
    label: 'Zcash',
    content: mark(ASSET_MARK.ZEC),
  },
  {
    slot: styles.h2 ?? '',
    color: 'ink',
    label: 'Sealed pack',
    content: <LockKeyIcon weight="fill" />,
  },
  {
    slot: styles.h3 ?? '',
    color: 'orange',
    label: 'Ticket',
    content: <TicketIcon weight="fill" />,
  },
  {
    slot: styles.h4 ?? '',
    color: 'light',
    mark: true,
    label: 'Bitcoin',
    content: mark(ASSET_MARK.BTC),
  },
  {
    slot: styles.h5 ?? '',
    color: 'light',
    mark: true,
    label: 'Solana',
    content: mark(ASSET_MARK.SOL),
  },
  {
    slot: styles.h6 ?? '',
    color: 'green',
    label: 'Term date',
    content: <CalendarCheckIcon weight="fill" />,
  },
  {
    slot: styles.h7 ?? '',
    color: 'light',
    mark: true,
    label: 'USD Coin',
    content: mark(ASSET_MARK.USDC),
  },
];

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.stage}>
        {TILES.map((tile) => (
          <div key={tile.label} className={cx(styles.hang, tile.slot)}>
            <div className={styles.bob}>
              <AppIcon color={tile.color} size={60} mark={tile.mark ?? false}>
                {tile.content}
              </AppIcon>
            </div>
          </div>
        ))}
        <div className={styles.content}>
          <Reveal trigger="load" delay={0.1}>
            <Tag
              badge="New"
              shape={<SparkleIcon weight="fill" color="var(--ill-lime)" size={18} />}
            >
              Live on NEAR Testnet
            </Tag>
          </Reveal>
          <WordReveal
            as="h1"
            trigger="load"
            className={cx('t-display', styles.title)}
            lines={['Pawn Your Coins,', { text: 'Keep the Upside', className: 't-accent' }]}
          />
          <Reveal as="p" trigger="load" delay={0.5} className={cx('t-body-lg', styles.lead)}>
            Mosaec seals ZEC in a keyless NEAR account and splits it into two NFTs. Sell the Title
            for USDC, keep the Ticket, and buy your coins back by the date at the agreed price.
          </Reveal>
          <Reveal trigger="load" delay={0.65} className={styles.actions}>
            <ButtonLink href={SITE.appUrl} as={Link}>
              Open App
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" showIcon>
              How It Works
            </ButtonLink>
          </Reveal>
        </div>
      </div>
      <div className={styles.folders}>
        <ProductFolder
          title="Borrow"
          caption="USDC against ZEC"
          dot="var(--accent)"
          icon={<LockKeyIcon weight="bold" color="var(--accent)" />}
          marks={[ASSET_MARK.ZEC, ASSET_MARK.BTC, ASSET_MARK.SOL]}
          href={SITE.appUrl}
        />
        <ProductFolder
          title="Lend"
          caption="A fixed repayment by a date"
          dot="var(--ill-violet)"
          icon={<CalendarCheckIcon weight="bold" color="var(--ill-violet)" />}
          marks={[ASSET_MARK.USDC, ASSET_MARK.ZEC, ASSET_MARK.USDC]}
          href={SITE.appUrl}
        />
        <ProductFolder
          title="Verify"
          caption="Every check runs in your browser"
          dot="var(--ill-green)"
          icon={<TicketIcon weight="bold" color="var(--ill-green)" />}
          marks={[ASSET_MARK.ZEC, ASSET_MARK.USDC, ASSET_MARK.ZEC]}
          href="#safety"
        />
      </div>
    </section>
  );
}
