import {
  AsteriskIcon,
  CalendarCheckIcon,
  LockKeyIcon,
  TicketIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { NETWORKS, explorerAccountUrl } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, Logo, Tag, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { SITE } from '../../../lib/site';

import styles from './Footer.module.css';

import type { CSSProperties, ReactNode } from 'react';

interface OrbitTile {
  readonly ring: number;
  readonly angle: number;
  readonly node: ReactNode;
}

const RING_RADIUS = [70, 130, 190] as const;
const RING_SPIN = ['36s', '52s', '70s'] as const;

const TILES: readonly OrbitTile[] = [
  { ring: 1, angle: 20, node: <Image src={ASSET_MARK.ZEC} alt="" width={24} height={24} /> },
  { ring: 1, angle: 200, node: <LockKeyIcon weight="fill" /> },
  { ring: 2, angle: 110, node: <Image src={ASSET_MARK.USDC} alt="" width={24} height={24} /> },
  { ring: 2, angle: 300, node: <TicketIcon weight="fill" /> },
  { ring: 2, angle: 220, node: <CalendarCheckIcon weight="fill" /> },
];
const TILE_COLORS = ['light', 'ink', 'light', 'orange', 'green'] as const;
const TILE_SIZE = 42;

function Orbit() {
  return (
    <div className={styles.orbit} aria-hidden="true">
      <span className={cx(styles.ring, styles.r1)} />
      <span className={cx(styles.ring, styles.r2)} />
      <span className={cx(styles.ring, styles.r3)} />
      <span className={styles.core}>
        <AppIcon color="ink" size={56}>
          <AsteriskIcon weight="bold" />
        </AppIcon>
      </span>
      {TILES.map((tile, index) => {
        const radius = RING_RADIUS[tile.ring] ?? 0;
        const rad = (tile.angle * Math.PI) / 180;
        const spin = { '--spin': RING_SPIN[tile.ring] } as CSSProperties;
        const place: CSSProperties = {
          left: radius + radius * Math.cos(rad) - TILE_SIZE / 2,
          top: radius + radius * Math.sin(rad) - TILE_SIZE / 2,
        };
        return (
          <span
            key={index}
            className={styles.spin}
            style={{ ...spin, width: radius * 2, height: radius * 2 }}
          >
            <span style={{ ...place, ...spin }}>
              <AppIcon
                color={TILE_COLORS[index] ?? 'light'}
                size={TILE_SIZE}
                mark={TILE_COLORS[index] === 'light'}
              >
                {tile.node}
              </AppIcon>
            </span>
          </span>
        );
      })}
    </div>
  );
}

const registryUrl = explorerAccountUrl('testnet', NETWORKS.testnet.registryAccountId);

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Open App', href: SITE.appUrl },
      { label: 'How It Works', href: '/#how' },
      { label: 'Safety', href: '/#safety' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    title: 'Source',
    links: [
      { label: 'GitHub', href: SITE.sourceUrl },
      { label: 'Registry on NearBlocks', href: registryUrl },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'Support', href: `mailto:${SITE.supportEmail}` },
      { label: 'Security', href: `mailto:${SITE.securityEmail}` },
    ],
  },
] as const;

function isExternal(href: string): boolean {
  return href.startsWith('http') || href.startsWith('mailto:');
}

export function Footer() {
  return (
    <footer className={styles.tray}>
      <div className={styles.cta}>
        <div className={styles.ctaCopy}>
          <Tag badge="8" shape={<AsteriskIcon weight="bold" size={16} color="var(--ill-lime)" />}>
            Get Started
          </Tag>
          <h2 className="t-h2">
            Your coins, a date
            <br />
            and a fair price.
          </h2>
          <p className="t-body">
            Open a pack with up to 1 ZEC on testnet and walk the full loan in a few minutes.
          </p>
          <div className={styles.ctaActions}>
            <ButtonLink href={SITE.appUrl} as={Link}>
              Open App
            </ButtonLink>
            <ButtonLink href={SITE.sourceUrl} variant="secondary" showIcon>
              Read the Code
            </ButtonLink>
          </div>
        </div>
        <Orbit />
      </div>
      <div className={styles.columns}>
        <div className={styles.brand}>
          <Logo />
          <p className="t-body-sm">The pawn ticket for native assets, settled on NEAR.</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} className={styles.col} aria-label={column.title}>
            <h2>{column.title}</h2>
            {column.links.map((link) =>
              isExternal(link.href) ? (
                <a key={link.label} href={link.href} className={styles.link}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
      <div className={styles.bottom}>
        <span className="t-caption">© 2026 Mosaec. MIT licensed.</span>
        <span className="t-caption">Design by Viyako</span>
      </div>
    </footer>
  );
}
