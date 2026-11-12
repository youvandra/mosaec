import { ArrowSquareOutIcon, BookOpenTextIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { ASSETS } from '@mosaec/config/assets';
import { GRACE_NS, NETWORKS, explorerAccountUrl } from '@mosaec/config/networks';
import { CONTRACT_ERROR_CODES, ERROR_CATALOG } from '@mosaec/domain';
import { ButtonLink, Reveal, Tag, WordReveal, cx } from '@mosaec/ui';

import { CODE_HASHES } from '../../../lib/deployments';
import { formatUnits } from '../../../lib/format';
import { SITE } from '../../../lib/site';
import { CopyButton } from '../../app/_components/CopyButton';
import { CodeWindow } from '../_blocks';

import styles from './docs.module.css';

import type { NetworkId } from '@mosaec/config/assets';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'How a Mosaec pawn works, the rules the contracts enforce, every deployed address and code hash, and how to check any pack yourself.',
};

const NS_PER_DAY = 86_400_000_000_000n;
const NS_PER_MINUTE = 60_000_000_000n;

function span(ns: bigint): string {
  const [count, unit] =
    ns >= NS_PER_DAY ? [ns / NS_PER_DAY, 'day'] : [ns / NS_PER_MINUTE, 'minute'];
  return `${count.toString()} ${unit}${count === 1n ? '' : 's'}`;
}

const TOC = [
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'rules', label: 'Rules' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'verify', label: 'Verify a Pack' },
  { id: 'agents', label: 'Agents' },
  { id: 'errors', label: 'Errors' },
] as const;

const STEPS: readonly (readonly [string, string, string])[] = [
  ['Mint', 'Borrower', 'The registry creates a keyless pack and gives the borrower its Title.'],
  ['Seal', 'Borrower', 'Coins move from NEAR Intents into the pack.'],
  ['Offer', 'Borrower', 'The Title holder lists a loan, a repayment and a term.'],
  ['Fill', 'Lender', 'The lender pays the loan and takes the Title. The borrower gets a Ticket.'],
  [
    'Redeem',
    'Ticket holder',
    'Pays the repayment before the date. The coins go to the Ticket holder.',
  ],
  ['Expire', 'Anyone', 'After the date, closes the pawn. The coins stay with the Title holder.'],
];

function DocSection({
  id,
  title,
  lead,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly lead?: string;
  readonly children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} aria-label={title}>
      <h2 className="t-h3">{title}</h2>
      {lead !== undefined && <p className={cx('t-body', styles.lead)}>{lead}</p>}
      {children}
    </section>
  );
}

function Id({ value, href }: { readonly value: string; readonly href?: string | undefined }) {
  return (
    <span className={styles.id}>
      {href === undefined ? (
        <code>{value}</code>
      ) : (
        <a href={href} target="_blank" rel="noreferrer">
          <code>{value}</code>
          <ArrowSquareOutIcon size={12} weight="bold" />
        </a>
      )}
    </span>
  );
}

function ContractTable({ network }: { readonly network: NetworkId }) {
  const config = NETWORKS[network];
  const hashes = CODE_HASHES[network];
  const rows: readonly (readonly [string, ReactNode])[] = [
    [
      'Registry',
      <Id
        key="r"
        value={config.registryAccountId}
        href={hashes === null ? undefined : explorerAccountUrl(network, config.registryAccountId)}
      />,
    ],
    [
      'NEAR Intents verifier',
      <Id
        key="v"
        value={config.verifierAccountId}
        href={hashes === null ? undefined : explorerAccountUrl(network, config.verifierAccountId)}
      />,
    ],
    [
      'Registry code hash',
      hashes === null ? (
        <span key="rh" className={styles.muted}>
          Not deployed
        </span>
      ) : (
        <Id key="rh" value={hashes.registry} />
      ),
    ],
    [
      'Pack code hash',
      hashes === null ? (
        <span key="ph" className={styles.muted}>
          Not deployed
        </span>
      ) : (
        <Id key="ph" value={hashes.pack} />
      ),
    ],
  ];
  return (
    <div className={styles.table}>
      <div className={styles.tableHead}>
        <span className="t-label">{network === 'testnet' ? 'Testnet' : 'Mainnet'}</span>
        <span className={cx(styles.state, hashes !== null && styles.stateLive)}>
          {hashes === null ? 'Planned' : 'Live'}
        </span>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.tableRow}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function DocsPage() {
  const testnet = NETWORKS.testnet;
  const caps = (['ZEC', 'BTC', 'SOL', 'USDC'] as const).map((symbol) => {
    const asset = ASSETS[symbol];
    return `${formatUnits(asset.capPerPack, asset.decimals)} ${symbol}`;
  });
  const viewCmd = `near view ${testnet.registryAccountId} position_of '{"pack":"0.${testnet.registryAccountId}"}' --networkId testnet`;
  const statusCmd = `near view 0.${testnet.registryAccountId} status --networkId testnet`;
  const keysCmd = `near list-keys 0.${testnet.registryAccountId} --networkId testnet`;
  return (
    <>
      <section className={styles.hero} aria-label="Docs">
        <span className={styles.glow} aria-hidden="true" />
        <Reveal trigger="load">
          <Tag
            badge="v0"
            shape={<BookOpenTextIcon weight="fill" size={16} color="var(--ill-violet)" />}
          >
            Docs
          </Tag>
        </Reveal>
        <WordReveal
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['The rules,', { text: 'in one place.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.4} className={cx('t-body-lg', styles.heroLead)}>
          What the contracts do, where they live and how to check them without trusting this site.
        </Reveal>
      </section>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="On this page">
          <span className={styles.tocTitle}>On this page</span>
          {TOC.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
          <ButtonLink
            href={SITE.sourceUrl}
            variant="secondary"
            size="sm"
            showIcon
            className={styles.tocCta}
          >
            Source Code
          </ButtonLink>
        </nav>

        <div className={styles.content}>
          <DocSection
            id="lifecycle"
            title="Lifecycle"
            lead="One pawn is six calls. Each one is a transaction anyone can read on the explorer."
          >
            <ol className={styles.steps}>
              {STEPS.map(([name, who, body], i) => (
                <li key={name} className={styles.step}>
                  <span className={styles.stepNum}>{(i + 1).toString()}</span>
                  <div>
                    <p className={styles.stepTitle}>
                      {name} <span className={styles.who}>{who}</span>
                    </p>
                    <p className={cx('t-body-sm', styles.muted)}>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </DocSection>

          <DocSection
            id="rules"
            title="Rules"
            lead="Enforced by the contracts. No price feed is read at any step."
          >
            <dl className={styles.facts}>
              <div>
                <dt>Term</dt>
                <dd>
                  {span(NETWORKS.mainnet.termBoundsNs.min)} to{' '}
                  {span(NETWORKS.mainnet.termBoundsNs.max)} on mainnet; from{' '}
                  {span(testnet.termBoundsNs.min)} on testnet
                </dd>
              </div>
              <div>
                <dt>Grace</dt>
                <dd>
                  {span(GRACE_NS)} after the date, only when NEAR Intents paused or locked the pack
                  in the last day
                </dd>
              </div>
              <div>
                <dt>Cap per pack</dt>
                <dd>{caps.join(' · ')}</dd>
              </div>
              <div>
                <dt>Keys on a pack</dt>
                <dd>Zero. A pack with any key is refused.</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>None in v0</dd>
              </div>
              <div>
                <dt>Guardian</dt>
                <dd>Can pause new pawns. Cannot move coins or change a running pawn.</dd>
              </div>
            </dl>
          </DocSection>

          <DocSection
            id="contracts"
            title="Contracts"
            lead="Every pack runs one published global contract. Compare the hash with the build from source."
          >
            <div className={styles.tables}>
              <ContractTable network="testnet" />
              <ContractTable network="mainnet" />
            </div>
          </DocSection>

          <DocSection
            id="verify"
            title="Verify a pack"
            lead="Three reads with the NEAR CLI. The app runs the same checks on every pack page."
          >
            <CodeWindow
              file="terminal"
              lines={[
                <span key="c1" className={styles.comment}>
                  # 1. Terms and holders
                </span>,
                viewCmd,
                <span key="c2" className={styles.comment}>
                  # 2. Stage and contents
                </span>,
                statusCmd,
                <span key="c3" className={styles.comment}>
                  # 3. No keys: expect an empty list
                </span>,
                keysCmd,
              ]}
            />
            <div className={styles.copyRow}>
              <CopyButton text={[viewCmd, statusCmd, keysCmd].join('\n')} label="Copy Commands" />
              <Link href="/app/verify" className={styles.inline}>
                Or verify in the app
              </Link>
            </div>
          </DocSection>

          <DocSection
            id="agents"
            title="Agents"
            lead="The house desk speaks MCP. Any agent can read the book and quote a pawn; filling needs a token."
          >
            <dl className={styles.facts}>
              <div>
                <dt>Endpoint</dt>
                <dd>
                  <Id value={SITE.deskMcpUrl} />
                </dd>
              </div>
              <div>
                <dt>Read</dt>
                <dd>
                  <code>desk_policy</code> · <code>list_offers</code> · <code>quote_offer</code> ·{' '}
                  <code>prepare_fill</code>
                </dd>
              </div>
              <div>
                <dt>Write</dt>
                <dd>
                  <code>fill_offer</code>, behind a bearer token
                </dd>
              </div>
            </dl>
            <Link href="/agents/connect" className={styles.inline}>
              Bring your own agent
            </Link>
          </DocSection>

          <DocSection
            id="errors"
            title="Errors"
            lead="Every refusal carries a code. The app shows the plain words; a refused payment always comes back."
          >
            <div className={styles.errors}>
              {CONTRACT_ERROR_CODES.map((code) => (
                <div key={code} className={styles.errorRow}>
                  <code>{code}</code>
                  <span>{ERROR_CATALOG[code].message}</span>
                  {ERROR_CATALOG[code].retryable && <span className={styles.retry}>Retry</span>}
                </div>
              ))}
            </div>
          </DocSection>
        </div>
      </div>
    </>
  );
}
