import { CheckCircleIcon, ShieldCheckIcon } from '@phosphor-icons/react/dist/ssr';

import { ASSETS } from '@mosaec/config/assets';
import { NftCard, Reveal, Section, SectionHeader, Tag, WordReveal, cx } from '@mosaec/ui';

import { CODE_HASHES } from '../../../lib/deployments';
import { formatUnits } from '../../../lib/format';

import styles from './Safety.module.css';

import type { ReactNode } from 'react';

const PACK_CODE_HASH = CODE_HASHES.testnet?.pack ?? '';

function Tile({
  title,
  body,
  className,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <Reveal className={cx(styles.tile, className ?? '')}>
      <h3 className="t-h3">{title}</h3>
      <p className="t-body">{body}</p>
      <div className={styles.visual}>{children}</div>
    </Reveal>
  );
}

function Line({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.line}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const VERIFY_CHECKS = [
  'Zero access keys',
  'Code hash matches the published wasm',
  'Predecessor authentication on',
  'Balances equal the committed hash',
] as const;

export function Safety() {
  return (
    <Section id="safety" label="Why it is safe">
      <SectionHeader layout="split" className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Reveal>
            <Tag
              badge="4"
              shape={<ShieldCheckIcon weight="fill" size={16} color="var(--ill-green)" />}
            >
              Safety
            </Tag>
          </Reveal>
          <WordReveal className="t-h1" lines={['Rules written in code,', 'checked by anyone.']} />
        </div>
        <Reveal as="p" className="t-body-lg">
          A pack moves its coins on two events only: the agreed payment before the date, or the date
          itself. Every rule below is a line of contract code you can read.
        </Reveal>
      </SectionHeader>
      <div className={styles.bento}>
        <Tile
          className={styles.wide}
          title="Zero Keys"
          body="A pack has no access key of any kind, so no person, team or stolen laptop can sign for it."
        >
          <Line label="Full-access keys" value="0" />
          <Line label="Function-call keys" value="0" />
        </Tile>
        <Tile
          className={styles.tall}
          title="One Code Hash"
          body="Every pack runs the same immutable global contract. Compare its hash with the wasm built from source."
        >
          <div className={styles.stack} aria-hidden="true">
            <NftCard
              kind="title"
              tokenLabel="Pack #2"
              value="Same code"
              style={{ transform: 'rotate(-10deg)', top: 0 }}
            />
            <NftCard
              kind="title"
              tokenLabel="Pack #1"
              value="Same code"
              style={{ transform: 'rotate(-4deg)', top: 14 }}
            />
          </div>
          <div className={styles.hash}>{PACK_CODE_HASH}</div>
        </Tile>
        <Tile
          title="Strike-Only Release"
          body="The pack checks its own incoming transfer, then pays out the recorded contents and nothing else."
        >
          <Line label="Ticket holder" value="Pays K before T" />
          <Line label="Title holder" value="After T" />
        </Tile>
        <Tile
          title="Grace Window"
          body="If the verifier pauses in the last day of a term, the borrower gets 24 more hours to redeem."
        >
          <Line label="Window" value="T minus 24 h to T" />
          <Line label="Extension" value="T plus 24 h" />
        </Tile>
        <Tile
          title="Per-Pack Caps"
          body="The first release limits each pack, keeping the amount at risk small while the code earns trust."
        >
          <div className={styles.chipRow}>
            {Object.values(ASSETS).map((asset) => (
              <span key={asset.symbol} className={styles.chip}>
                {formatUnits(asset.capPerPack, asset.decimals)} {asset.symbol}
              </span>
            ))}
          </div>
        </Tile>
        <Tile
          className={styles.wide}
          title="Verify in Your Browser"
          body="Paste any pack id and your browser reads the chain directly, with each check linked to the explorer."
        >
          {VERIFY_CHECKS.map((check) => (
            <div key={check} className={styles.line}>
              <span>{check}</span>
              <CheckCircleIcon weight="fill" size={20} className={styles.check} />
            </div>
          ))}
        </Tile>
      </div>
    </Section>
  );
}
