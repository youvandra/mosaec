import { CheckIcon, EyeIcon, GlobeIcon, LightningIcon } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { DEFAULT_NETWORK } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import { listPacks } from '../../../lib/api';
import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatUnits } from '../../../lib/format';
import { SITE } from '../../../lib/site';
import { STATUS_TONE } from '../../../lib/status';

import styles from './LivePacks.module.css';

import type { Pack } from '../../../lib/api';
import type { AssetSymbol } from '@mosaec/config/assets';

const SHOWN = 6;
const FETCHED = 50;

function isAssetSymbol(value: string | null): value is AssetSymbol {
  return value !== null && value in ASSET_MARK;
}

function contentsLine(pack: Pack): string {
  if (pack.contents.length === 0) return 'Settled, contents released';
  return pack.contents
    .map(
      (line) =>
        `${line.decimals === null ? line.amount : formatUnits(line.amount, line.decimals, 4)} ${line.symbol ?? line.tokenId}`,
    )
    .join(' + ');
}

function PackRow({ pack }: { readonly pack: Pack }) {
  const first = pack.contents[0];
  const symbol = first?.symbol ?? null;
  return (
    <li className={styles.row}>
      <AppIcon color="light" size={40} mark>
        <Image
          src={ASSET_MARK[isAssetSymbol(symbol) ? symbol : 'ZEC']}
          alt=""
          width={24}
          height={24}
        />
      </AppIcon>
      <div className={styles.rowMain}>
        <span className="t-label">Pack #{pack.index}</span>
        <span className="t-caption">{contentsLine(pack)}</span>
      </div>
      {pack.status !== null ? (
        <StatusPill tone={STATUS_TONE[pack.status]}>{pack.status}</StatusPill>
      ) : (
        <StatusPill tone="neutral">Free</StatusPill>
      )}
    </li>
  );
}

async function PackList() {
  const packs = await listPacks(DEFAULT_NETWORK, FETCHED).catch(() => null);
  const latest =
    packs === null
      ? null
      : [...packs].sort((a, b) => Number(BigInt(b.index) - BigInt(a.index))).slice(0, SHOWN);
  return (
    <div className={styles.list}>
      <div className={styles.listHead}>
        <span className="t-h5">Latest packs</span>
        <StatusPill tone="positive">Live</StatusPill>
      </div>
      {latest === null ? (
        <p className={cx('t-body-sm', styles.empty)}>
          The pack feed is unavailable right now. Every pack stays readable on the explorer.
        </p>
      ) : latest.length === 0 ? (
        <p className={cx('t-body-sm', styles.empty)}>
          No packs yet. The first one appears here seconds after it is minted.
        </p>
      ) : (
        <ul>
          {latest.map((pack) => (
            <PackRow key={pack.id} pack={pack} />
          ))}
        </ul>
      )}
    </div>
  );
}

const CHECKS = [
  'Contents and terms on a public page',
  'Holders of both NFTs, linked to the explorer',
  'Every receipt from mint to release',
] as const;

export function LivePacks() {
  return (
    <Section id="public" label="Every pack is public">
      <div className={styles.grid}>
        <div className={styles.copy}>
          <Reveal>
            <Tag badge="6" shape={<EyeIcon weight="fill" size={16} color="var(--ill-mint)" />}>
              Public Record
            </Tag>
          </Reveal>
          <WordReveal className="t-h1" lines={['Every pack,', 'in plain sight.']} />
          <Reveal as="p" className="t-body-lg">
            An indexer follows the registry and every pack it created. What it shows, your browser
            can confirm against the chain.
          </Reveal>
          <Reveal as="ul" className={styles.checks}>
            {CHECKS.map((check) => (
              <li key={check}>
                <span className={styles.tick}>
                  <CheckIcon weight="bold" size={12} />
                </span>
                {check}
              </li>
            ))}
          </Reveal>
          <Reveal>
            <ButtonLink href={SITE.appUrl} as={Link} variant="secondary" showIcon>
              Browse Packs
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal className={styles.panel}>
          <span className={cx(styles.floatChip, styles.chipTop)}>
            <GlobeIcon size={16} weight="bold" color="var(--accent)" />
            v0.mosaec.testnet
          </span>
          <PackList />
          <span className={cx(styles.floatChip, styles.chipDark)}>
            <LightningIcon size={16} weight="fill" color="var(--ill-lime)" />
            One receipt chain
          </span>
        </Reveal>
      </div>
    </Section>
  );
}
