import {
  CalendarCheckIcon,
  CaretRightIcon,
  GithubLogoIcon,
  LockKeyIcon,
  SparkleIcon,
  TicketIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { NETWORKS, explorerAccountUrl } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, Logo, Mark, Tag, cx } from '@mosaec/ui';

import { ASSET_MARK, NEAR_MARK } from '../../../lib/asset-marks';
import { SITE } from '../../../lib/site';

import styles from './Footer.module.css';

import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

interface OrbitTile {
  readonly top: number;
  readonly left: number;
  readonly color: AppIconColor;
  readonly mark?: boolean;
  readonly node: ReactNode;
}

/** Holder positions copied from the design source's two orbit groups. */
const INNER: readonly OrbitTile[] = [
  {
    top: -4,
    left: 174,
    color: 'light',
    mark: true,
    node: <Image src={ASSET_MARK.ZEC} alt="" width={26} height={26} />,
  },
  { top: 222, left: 44, color: 'green', node: <CalendarCheckIcon weight="fill" /> },
];
const OUTER: readonly OrbitTile[] = [
  { top: 234, left: 348, color: 'ink', node: <LockKeyIcon weight="fill" /> },
  {
    top: 291,
    left: 23,
    color: 'light',
    mark: true,
    node: <Image src={ASSET_MARK.USDC} alt="" width={26} height={26} />,
  },
  { top: -18, left: 136, color: 'orange', node: <TicketIcon weight="fill" /> },
];

function Holders({ tiles }: { readonly tiles: readonly OrbitTile[] }) {
  return tiles.map((tile, index) => (
    <span key={index} className={styles.holder} style={{ top: tile.top, left: tile.left }}>
      <AppIcon color={tile.color} size={42} mark={tile.mark ?? false}>
        {tile.node}
      </AppIcon>
    </span>
  ));
}

function Orbit() {
  return (
    <div className={styles.orbit} aria-hidden="true">
      <span className={cx(styles.ring, styles.r1)} />
      <span className={cx(styles.ring, styles.r2)} />
      <span className={cx(styles.ring, styles.r3)} />
      <span className={styles.core}>
        <Mark />
      </span>
      <span className={cx(styles.group, styles.g1)}>
        <Holders tiles={INNER} />
      </span>
      <span className={cx(styles.group, styles.g2)}>
        <Holders tiles={OUTER} />
      </span>
    </div>
  );
}

const registryUrl = explorerAccountUrl('testnet', NETWORKS.testnet.registryAccountId);

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Borrow', href: '/borrow' },
      { label: 'Lend', href: '/lend' },
      { label: 'Agents', href: '/agents' },
      { label: 'Market', href: '/market' },
      { label: 'Rates', href: '/rates' },
      { label: 'Open App', href: SITE.appUrl },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Verify a Pack', href: '/verify' },
      { label: 'Docs', href: '/docs' },
      { label: 'Safety Rules', href: '/verify#rules' },
      { label: 'Registry on NearBlocks', href: registryUrl },
      { label: 'Risks', href: '/risks' },
      { label: 'Security Contact', href: `mailto:${SITE.securityEmail}` },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Bring Your Agent', href: '/agents' },
      { label: 'About Mosaec', href: '/about' },
      { label: 'How a Pawn Works', href: '/#how' },
      { label: 'Questions', href: '/#faq' },
      { label: 'GitHub', href: SITE.sourceUrl },
      { label: 'Support', href: `mailto:${SITE.supportEmail}` },
    ],
  },
] as const;

function FooterLink({ href, label }: { readonly href: string; readonly label: string }) {
  const external = href.startsWith('http') || href.startsWith('mailto:');
  const content = (
    <>
      {label}
      {external && <CaretRightIcon size={12} className={styles.linkCaret} />}
    </>
  );
  return external ? (
    <a href={href} className={styles.link}>
      {content}
    </a>
  ) : (
    <Link href={href} className={styles.link}>
      {content}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className={styles.tray}>
      <div className={styles.cta}>
        <div className={styles.ctaCopy}>
          <Tag
            badge="Start"
            shape={<SparkleIcon weight="fill" size={16} color="var(--ill-lime)" />}
          >
            Open a Pawn
          </Tag>
          <h2 className="t-h2">
            Your coins, a date
            <br />
            and a fair price.
          </h2>
          <p className="t-body">
            Seal up to 1 ZEC on testnet and walk a full loan, from pack to redemption, in minutes.
          </p>
          <div className={styles.ctaActions}>
            <ButtonLink href={SITE.appUrl} as={Link}>
              Open App
            </ButtonLink>
            <ButtonLink href="/borrow" as={Link} variant="secondary" showIcon>
              How a Pawn Works
            </ButtonLink>
          </div>
        </div>
        <Orbit />
      </div>
      <div className={styles.columns}>
        <div className={styles.brand}>
          <Logo interactive />
          <p className="t-body-sm">The pawn ticket for native assets, settled on NEAR.</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} className={styles.col} aria-label={column.title}>
            <h2>{column.title}</h2>
            {column.links.map((link) => (
              <FooterLink key={link.label} href={link.href} label={link.label} />
            ))}
          </nav>
        ))}
      </div>
      <div className={styles.divider} />
      <div className={styles.bottom}>
        <span className={styles.bottomLeft}>
          <span className="t-caption">© 2026 Mosaec. Source under the MIT licence.</span>
          <Link href="/terms" className={styles.legal}>
            Terms
          </Link>
          <Link href="/privacy" className={styles.legal}>
            Privacy
          </Link>
        </span>
        <span className={styles.bottomRight}>
          <a href="https://near.org" className={styles.chain} target="_blank" rel="noreferrer">
            <Image src={NEAR_MARK.src} alt="" width={18} height={18} />
            Built on NEAR
          </a>
          <span className="t-caption">Design by Viyako</span>
          <a href={SITE.sourceUrl} className={styles.social} aria-label="Mosaec on GitHub">
            <GithubLogoIcon size={20} weight="fill" />
          </a>
        </span>
      </div>
    </footer>
  );
}
