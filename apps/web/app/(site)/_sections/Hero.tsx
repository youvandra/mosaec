import {
  CalendarCheckIcon,
  LockKeyIcon,
  RobotIcon,
  SealCheckIcon,
  SparkleIcon,
  HandCoinsIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { AppIcon, ButtonLink, Reveal, Tag, WordReveal, cx } from '@mosaec/ui';

import { ASSET_FILL, ASSET_MARK, NEAR_MARK } from '../../../lib/asset-marks';
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
  /** Token colour the tile takes, so the round mark sits on its own colour. */
  readonly fill?: string;
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
    label: 'House desk',
    color: 'violet',
    content: <RobotIcon weight="fill" />,
    side: 'right',
    offset: 238,
    top: 112,
  },
  {
    label: 'Bitcoin',
    color: 'light',
    mark: true,
    fill: ASSET_FILL.BTC,
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
    fill: ASSET_FILL.USDC,
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
    fill: ASSET_FILL.SOL,
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
            <AppIcon color="light" size={60} mark fill={ASSET_FILL.ZEC}>
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
            <AppIcon color={tile.color} size={60} mark={tile.mark ?? false} fill={tile.fill}>
              {tile.content}
            </AppIcon>
          </Lanyard>
        ))}
        <Reveal trigger="load" delay={0.1}>
          <Tag badge="New" shape={<SparkleIcon weight="fill" color="var(--ill-lime)" size={18} />}>
            <span className={styles.liveOn}>
              Live on
              <Image
                src={NEAR_MARK.src}
                alt=""
                width={16}
                height={16}
                className={styles.nearMark}
              />
              NEAR Testnet
            </span>
          </Tag>
        </Reveal>
        <WordReveal
          id="hero-title"
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Pawn Your Coins,', { text: 'Keep the Upside', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.55} className={cx('t-body-lg', styles.lead)}>
          Get USDC for your ZEC, BTC or SOL. One fixed repayment, one fixed date, zero liquidation.
          The House Desk answers in about a minute, and your coins wait in a sealed account until
          you pay.
        </Reveal>
        <Reveal trigger="load" delay={0.8} className={styles.actions}>
          <ButtonLink href={`${SITE.appUrl}/borrow`} as={Link}>
            Get USDC Now
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
    caption: 'USDC now, zero liquidation',
    dot: 'var(--accent)',
    icon: <HandCoinsIcon weight="bold" color="var(--accent)" />,
    photos: PHOTOS.borrow,
    href: '/borrow',
  },
  {
    title: 'Lend',
    caption: 'A fixed return, set upfront',
    dot: 'var(--ill-violet)',
    icon: <CalendarCheckIcon weight="bold" color="var(--ill-violet)" />,
    photos: PHOTOS.lend,
    href: '/lend',
  },
  {
    title: 'House Desk',
    caption: 'A loan in about a minute',
    dot: 'var(--ill-orange)',
    icon: <RobotIcon weight="bold" color="var(--ill-orange)" />,
    photos: PHOTOS.agents,
    href: '/agents',
  },
  {
    title: 'Verify',
    caption: 'Check any pack yourself',
    dot: 'var(--ill-green)',
    icon: <SealCheckIcon weight="bold" color="var(--ill-green)" />,
    photos: PHOTOS.verify,
    href: '/verify',
  },
] as const;
