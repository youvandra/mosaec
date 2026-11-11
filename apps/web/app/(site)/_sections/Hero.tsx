import {
  CalendarCheckIcon,
  LockKeyIcon,
  RobotIcon,
  SealCheckIcon,
  SparkleIcon,
  TicketIcon,
  HandCoinsIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { AppIcon, ButtonLink, Reveal, Tag, WordReveal, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { PHOTOS } from '../../../lib/photos';
import { SITE } from '../../../lib/site';
import { Lanyard } from '../_components/Lanyard';

import styles from './Hero.module.css';
import { ProductFolder } from './ProductFolder';

import type { AppIconColor } from '@mosaec/ui';
import type { CSSProperties, ReactNode } from 'react';

interface Tile {
  readonly label: string;
  readonly color: AppIconColor;
  readonly mark?: boolean;
  readonly content: ReactNode;
  readonly side: 'left' | 'right';
  readonly offset: number;
  readonly top: number;
  readonly far?: boolean;
}

function mark(src: string) {
  return <Image src={src} alt="" width={40} height={40} priority />;
}

/** Positions match the design source's six hanging logos. */
const TILES: readonly Tile[] = [
  {
    label: 'Sealed pack',
    color: 'ink',
    content: <LockKeyIcon weight="fill" />,
    side: 'left',
    offset: 238,
    top: 108,
  },
  {
    label: 'Ticket',
    color: 'orange',
    content: <TicketIcon weight="fill" />,
    side: 'right',
    offset: 238,
    top: 112,
  },
  {
    label: 'Bitcoin',
    color: 'light',
    mark: true,
    content: mark(ASSET_MARK.BTC),
    side: 'left',
    offset: 104,
    top: 280,
    far: true,
  },
  {
    label: 'USD Coin',
    color: 'light',
    mark: true,
    content: mark(ASSET_MARK.USDC),
    side: 'right',
    offset: 104,
    top: 270,
    far: true,
  },
  {
    label: 'Term date',
    color: 'green',
    content: <CalendarCheckIcon weight="fill" />,
    side: 'left',
    offset: 204,
    top: 460,
  },
  {
    label: 'Solana',
    color: 'light',
    mark: true,
    content: mark(ASSET_MARK.SOL),
    side: 'right',
    offset: 204,
    top: 458,
  },
];

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.orbitSlot}>
          <Lanyard className={cx(styles.tile, styles.center)} label="Zcash">
            <AppIcon color="light" size={60} mark>
              {mark(ASSET_MARK.ZEC)}
            </AppIcon>
          </Lanyard>
        </div>
        {TILES.map((tile) => (
          <Lanyard
            key={tile.label}
            label={tile.label}
            className={cx(styles.tile, styles[tile.side], tile.far === true && styles.far)}
            style={
              {
                '--side': `${tile.offset.toString()}px`,
                '--top': `${tile.top.toString()}px`,
              } as CSSProperties
            }
          >
            <AppIcon color={tile.color} size={60} mark={tile.mark ?? false}>
              {tile.content}
            </AppIcon>
          </Lanyard>
        ))}
        <Reveal trigger="load" delay={0.1}>
          <Tag badge="New" shape={<SparkleIcon weight="fill" color="var(--ill-lime)" size={18} />}>
            Live on NEAR Testnet
          </Tag>
        </Reveal>
        <WordReveal
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Pawn Your Coins,', { text: 'Keep the Upside', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.55} className={cx('t-body-lg', styles.lead)}>
          Seal ZEC in a keyless NEAR account, sell its Title for USDC and keep the Ticket that buys
          it back. A date and a price decide the loan; the market never does.
        </Reveal>
        <Reveal trigger="load" delay={0.8} className={styles.actions}>
          <ButtonLink href={SITE.appUrl} as={Link}>
            Open App
          </ButtonLink>
          <ButtonLink href="/borrow" as={Link} variant="secondary" showIcon>
            How a Pawn Works
          </ButtonLink>
        </Reveal>
      </div>
      <div className={styles.folders}>
        {FOLDERS.map((folder, index) => (
          <Reveal key={folder.title} delay={0.1 + index * 0.08}>
            <ProductFolder {...folder} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const FOLDERS = [
  {
    title: 'Borrow',
    caption: 'USDC with no liquidation',
    dot: 'var(--accent)',
    icon: <HandCoinsIcon weight="bold" color="var(--accent)" />,
    photos: PHOTOS.borrow,
    href: '/borrow',
  },
  {
    title: 'Lend',
    caption: 'A fixed repayment by a date',
    dot: 'var(--ill-violet)',
    icon: <CalendarCheckIcon weight="bold" color="var(--ill-violet)" />,
    photos: PHOTOS.lend,
    href: '/lend',
  },
  {
    title: 'Agents',
    caption: 'Every rule is machine-readable',
    dot: 'var(--ill-orange)',
    icon: <RobotIcon weight="bold" color="var(--ill-orange)" />,
    photos: PHOTOS.agents,
    href: '/agents',
  },
  {
    title: 'Verify',
    caption: 'Every check in your browser',
    dot: 'var(--ill-green)',
    icon: <SealCheckIcon weight="bold" color="var(--ill-green)" />,
    photos: PHOTOS.verify,
    href: '/verify',
  },
] as const;
