import { CoinsIcon } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';

import { ASSETS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import { AppIcon, Reveal, Section, SectionHeader, StatusPill, Tag, WordReveal } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatUnits } from '../../../lib/format';

import styles from './Assets.module.css';

import type { AssetSymbol } from '@mosaec/config/assets';

const TICKER: readonly AssetSymbol[] = ['ZEC', 'BTC', 'SOL', 'USDC', 'ZEC', 'BTC', 'SOL', 'USDC'];

const ROLE_LABEL = { collateral: 'Collateral', settlement: 'Loan and Repayment' } as const;

function liveOnTestnet(symbol: AssetSymbol): boolean {
  return (NETWORKS.testnet.assets as readonly AssetSymbol[]).includes(symbol);
}

export function Assets() {
  return (
    <Section id="assets" label="Assets">
      <div className={styles.ticker} aria-hidden="true">
        <div className={styles.tickerRow}>
          {[...TICKER, ...TICKER].map((symbol, index) => (
            <span key={index} className={styles.tickerItem}>
              <AppIcon color="light" size={40} mark>
                <Image src={ASSET_MARK[symbol]} alt="" width={26} height={26} />
              </AppIcon>
              {symbol}
            </span>
          ))}
        </div>
      </div>
      <SectionHeader layout="split" className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Reveal>
            <Tag badge="7" shape={<CoinsIcon weight="fill" size={16} color="var(--ill-orange)" />}>
              Assets
            </Tag>
          </Reveal>
          <WordReveal className="t-h1" lines={['Native coins in,', 'dollars out.']} />
        </div>
        <Reveal as="p" className="t-body-lg">
          Packs hold coins bridged into NEAR Intents from their own chains. Loans and repayments
          settle in USDC, and a withdrawal sends coins back where they came from.
        </Reveal>
      </SectionHeader>
      <div className={styles.grid}>
        {Object.values(ASSETS).map((asset) => (
          <Reveal key={asset.symbol} className={styles.card}>
            <div className={styles.top}>
              <AppIcon color="light" size={56} mark>
                <Image src={ASSET_MARK[asset.symbol]} alt="" width={36} height={36} />
              </AppIcon>
              {liveOnTestnet(asset.symbol) && <StatusPill tone="positive">Testnet</StatusPill>}
            </div>
            <div>
              <h3 className="t-h4">{asset.name}</h3>
              <p className="t-body-sm">{asset.symbol}</p>
            </div>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Role</dt>
                <dd>{ROLE_LABEL[asset.role]}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Cap per pack</dt>
                <dd>
                  {formatUnits(asset.capPerPack, asset.decimals)} {asset.symbol}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Home chain</dt>
                <dd>{asset.homeChain}</dd>
              </div>
            </dl>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
