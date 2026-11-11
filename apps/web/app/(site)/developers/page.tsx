import {
  ArrowSquareOutIcon,
  BracketsCurlyIcon,
  CodeIcon,
  CubeIcon,
  GithubLogoIcon,
  GlobeIcon,
  PlugsConnectedIcon,
  TerminalWindowIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react/dist/ssr';

import { NETWORKS, explorerAccountUrl } from '@mosaec/config/networks';
import { ERROR_CATALOG, ERROR_CODES } from '@mosaec/domain';
import { AppIcon, ButtonLink, Reveal, Section, Tag, WordReveal, cx } from '@mosaec/ui';

import { CODE_HASHES, shortHash } from '../../../lib/deployments';
import { SITE } from '../../../lib/site';
import { CodeWindow, Eyebrow, SectionIntro, codeStyles } from '../_blocks';

import styles from './developers.module.css';

import type { ErrorCode } from '@mosaec/domain';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'Build on the Mosaec pawn primitive: a TypeScript SDK, a read-only API, two NEAR contracts and one error catalog.',
};

const TESTNET = NETWORKS.testnet;
const HASHES = CODE_HASHES.testnet;

/* Tiny highlighter pieces for the code sample. */
const k = (text: string) => <span className={styles.kw}>{text}</span>;
const s = (text: string) => <span className={styles.str}>{text}</span>;
const f = (text: string) => <span className={styles.fn}>{text}</span>;
const c = (text: string) => <span className={styles.cm}>{text}</span>;

const SAMPLE: readonly ReactNode[] = [
  <>
    {k('import')} {'{ MosaecViews, mosaecCalls, parseOutcome }'} {k('from')} {s("'@mosaec/sdk'")};
  </>,
  '',
  <>
    {k('const')} views = {k('new')} {f('MosaecViews')}({s("'testnet'")});
  </>,
  <>
    {k('const')} stage = ({k('await')} views.{f('positionOf')}(pack))?.position.stage;
  </>,
  <>
    {k('if')} (stage?.state !== {s("'offered'")}) {k('throw new')} {f('Error')}(
    {s("'no open offer'")});
  </>,
  '',
  <>
    {k('const')} call = {f('mosaecCalls')}({s("'testnet'")}).{f('fill')}({'{'}
  </>,
  '  pack,',
  '  terms: {',
  '    kToken: stage.terms.k_token,',
  '    kAmount: stage.terms.k_amount,',
  '    termNs: stage.terms.term_ns,',
  '  },',
  '  contentsHash: stage.contents_hash,',
  '  payToken: stage.pay_token,',
  '  price: stage.price,',
  '});',
  '',
  <>
    {k('const')} outcome = {f('parseOutcome')}({k('await')} wallet.{f('send')}(call));{' '}
    {c('// your wallet')}
  </>,
];

const OUTPUT: readonly ReactNode[] = [
  <span key="cmd">$ tsx fill.ts</span>,
  <span key="ok">
    <span className={codeStyles.ok}>{"{ status: 'settled', refunded: false }"}</span>
  </span>,
  <span key="alt">{"// or { status: 'refused', code: 'E_CONTENTS', refunded: true }"}</span>,
];

interface Resource {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly icon: ReactNode;
}

const RESOURCES: readonly Resource[] = [
  {
    title: 'SDK',
    body: 'Pure call builders, typed views, outcome parsing and pawn arithmetic in TypeScript.',
    href: '#sdk',
    icon: <BracketsCurlyIcon size={20} weight="bold" />,
  },
  {
    title: 'API',
    body: 'Read-only JSON over Hono for packs, positions and open offers.',
    href: '#api',
    icon: <PlugsConnectedIcon size={20} weight="bold" />,
  },
  {
    title: 'Error Catalog',
    body: `${ERROR_CODES.length.toString()} codes shared by the contracts, the API and the desk.`,
    href: '#errors',
    icon: <WarningOctagonIcon size={20} weight="bold" />,
  },
  {
    title: 'Contracts',
    body: 'A registry and one global pack contract in Rust on NEAR.',
    href: '#contracts',
    icon: <CubeIcon size={20} weight="bold" />,
  },
];

const ENDPOINTS = [
  {
    path: '/packs',
    returns: 'Every pack with status, contents, offer and terms; filters by state and owner.',
  },
  { path: '/packs/:id', returns: 'One pack with its event history.' },
  {
    path: '/accounts/:id/positions',
    returns: 'Packs where the account holds the Title or the Ticket.',
  },
  { path: '/offers', returns: 'Open offers, ready to fill.' },
  { path: '/health', returns: 'Liveness of the service.' },
  { path: '/ready', returns: 'Indexer lag and registry pause state per network.' },
] as const;

const CATALOG_PREVIEW: readonly ErrorCode[] = [
  'E_TERMS',
  'E_CONTENTS',
  'E_EXPIRED',
  'E_CAP',
  'E_HOLDER',
  'E_GRACE',
];

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="developers-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.heroContent}>
        <Reveal trigger="load" delay={0.1}>
          <Tag badge="Mosaec" shape={<CodeIcon weight="bold" size={16} color="var(--ill-lime)" />}>
            Developers
          </Tag>
        </Reveal>
        <WordReveal
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Build on the', { text: 'pawn primitive.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.5} className={cx('t-body-lg', styles.lead)}>
          Mosaec is open source: a TypeScript SDK, a read-only API and two NEAR contracts that share
          one error catalog. Every call the app signs is a pure function you can call too.
        </Reveal>
        <Reveal trigger="load" delay={0.7} className={styles.actions}>
          <ButtonLink
            href={SITE.sourceUrl}
            target="_blank"
            rel="noreferrer"
            icon={<GithubLogoIcon size={16} weight="bold" />}
          >
            GitHub
          </ButtonLink>
          <ButtonLink href="#api" variant="secondary" showIcon>
            API Reference
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

function Sdk() {
  return (
    <div className={styles.dark}>
      <Section id="sdk" label="SDK">
        <div className={styles.sdkGrid}>
          <div className={styles.sdkCopy}>
            <Reveal>
              <Tag
                badge="1"
                tone="inverse"
                shape={<BracketsCurlyIcon weight="bold" size={16} color="var(--ill-lime)" />}
              >
                TypeScript SDK
              </Tag>
            </Reveal>
            <WordReveal className="t-h1" lines={['Fill a pawn', 'in one call.']} />
            <Reveal as="p" className={cx('t-body-lg', styles.dim)} delay={0.2}>
              Read the offer from chain, build the exact transfer the contract expects and read the
              result as settled, refused or failed. The builders are pure and touch no network.
            </Reveal>
            <Reveal delay={0.3}>
              <ButtonLink
                href={SITE.sourceUrl}
                variant="inverse"
                target="_blank"
                rel="noreferrer"
                showIcon
              >
                Read the Source
              </ButtonLink>
            </Reveal>
          </div>
          <Reveal className={styles.codeWrap} delay={0.15}>
            <CodeWindow file="fill.ts" lines={SAMPLE} output={OUTPUT} />
          </Reveal>
        </div>
        <div className={styles.resources}>
          {RESOURCES.map((item, index) => (
            <Reveal key={item.title} delay={0.05 * index}>
              <a href={item.href} className={styles.resource}>
                <span className={styles.resourceIcon}>{item.icon}</span>
                <span className="t-h5">{item.title}</span>
                <span className={cx('t-body-sm', styles.dim)}>{item.body}</span>
              </a>
            </Reveal>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Api() {
  return (
    <Section id="api" label="API">
      <SectionIntro
        layout="split"
        eyebrow={
          <Eyebrow
            badge="2"
            shape={<GlobeIcon weight="fill" size={16} color="var(--ill-violet)" />}
            label="API"
          />
        }
        title={['Six routes,', 'all read-only.']}
        lead={
          <>
            The pack routes take <code className={styles.inline}>?network=testnet</code>. Amounts
            and times arrive as decimal strings, so no value loses precision in JSON.
          </>
        }
      />
      <Reveal className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Path</th>
              <th scope="col">Returns</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((row) => (
              <tr key={row.path}>
                <td>
                  <span className={styles.method}>GET</span>
                </td>
                <td>
                  <code className={styles.path}>{row.path}</code>
                </td>
                <td className="t-body-sm">{row.returns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </Section>
  );
}

function ContractRow({
  label,
  value,
  href,
}: {
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}) {
  return (
    <div className={styles.contractRow}>
      <span className="t-label">{label}</span>
      {href === undefined ? (
        <code className={styles.hash} title={value}>
          {shortHash(value, 10)}
        </code>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className={styles.account}>
          <code>{value}</code>
          <ArrowSquareOutIcon size={14} weight="bold" />
        </a>
      )}
    </div>
  );
}

function Contracts() {
  return (
    <Section id="contracts" label="Contracts">
      <SectionIntro
        layout="split"
        eyebrow={
          <Eyebrow
            badge="3"
            shape={<CubeIcon weight="fill" size={16} color="var(--ill-orange)" />}
            label="Contracts"
          />
        }
        title={['Deployed on', 'NEAR testnet.']}
        lead={`The registry mints every pack from one global contract, so each pack runs the same code. Mainnet opens at ${NETWORKS.mainnet.registryAccountId} as the next milestone.`}
      />
      <div className={styles.contracts}>
        <Reveal className={styles.contractCard}>
          <AppIcon color="ink" size={44}>
            <CubeIcon weight="fill" />
          </AppIcon>
          <h3 className="t-h4">Accounts</h3>
          <ContractRow
            label="Registry"
            value={TESTNET.registryAccountId}
            href={explorerAccountUrl('testnet', TESTNET.registryAccountId)}
          />
          <ContractRow
            label="Verifier"
            value={TESTNET.verifierAccountId}
            href={explorerAccountUrl('testnet', TESTNET.verifierAccountId)}
          />
        </Reveal>
        <Reveal className={styles.contractCard} delay={0.1}>
          <AppIcon color="blue" size={44}>
            <TerminalWindowIcon weight="fill" />
          </AppIcon>
          <h3 className="t-h4">Code hashes</h3>
          {HASHES !== null && (
            <>
              <ContractRow label="Pack" value={HASHES.pack} />
              <ContractRow label="Registry" value={HASHES.registry} />
            </>
          )}
        </Reveal>
      </div>
    </Section>
  );
}

function Errors() {
  return (
    <Section id="errors" label="Error catalog">
      <SectionIntro
        layout="split"
        eyebrow={
          <Eyebrow
            badge="4"
            shape={<WarningOctagonIcon weight="fill" size={16} color="var(--ill-coral)" />}
            label="Error Catalog"
          />
        }
        title={['One code,', 'one plain message.']}
        lead="A contract refusal, an API error and a desk decline all come from the same catalog in @mosaec/domain. A test fails when the Rust and TypeScript lists drift apart."
      />
      <div className={styles.errors}>
        {CATALOG_PREVIEW.map((code, index) => (
          <Reveal key={code} className={styles.error} delay={0.04 * index}>
            <div className={styles.errorHead}>
              <code className={styles.errorCode}>{code}</code>
              <span className="t-caption">HTTP {ERROR_CATALOG[code].httpStatus.toString()}</span>
            </div>
            <p className="t-body-sm">{ERROR_CATALOG[code].message}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <Section label="Source">
      <Reveal className={styles.cta}>
        <AppIcon color="lime" size={52}>
          <GithubLogoIcon weight="fill" />
        </AppIcon>
        <h2 className="t-h1">Read every line.</h2>
        <p className={cx('t-body-lg', styles.dim)}>
          Contracts, SDK, API, indexer and this site live in one MIT-licensed repository.
        </p>
        <ButtonLink
          href={SITE.sourceUrl}
          target="_blank"
          rel="noreferrer"
          variant="inverse"
          showIcon
        >
          Open the Repository
        </ButtonLink>
      </Reveal>
    </Section>
  );
}

export default function DevelopersPage() {
  return (
    <>
      <Hero />
      <Sdk />
      <Api />
      <Contracts />
      <Errors />
      <FinalCta />
    </>
  );
}
