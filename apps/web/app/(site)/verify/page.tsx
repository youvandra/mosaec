import {
  BugBeetleIcon,
  CheckIcon,
  ClipboardTextIcon,
  CubeIcon,
  EnvelopeSimpleIcon,
  FileCodeIcon,
  KeyIcon,
  LockKeyIcon,
  PauseIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  TicketIcon,
  WalletIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { ASSETS, ASSET_SYMBOLS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { CODE_HASHES } from '../../../lib/deployments';
import { formatUnits } from '../../../lib/format';
import { SITE } from '../../../lib/site';
import { Eyebrow, FaqBlock, SectionIntro } from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './verify.module.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Verify',
  description:
    'Check any Mosaec pack yourself: zero keys, one published code hash, coins that leave only on repayment or the date, and a guardian that can only pause.',
};

const TESTNET = NETWORKS.testnet;
const PACK_CODE_HASH = CODE_HASHES.testnet?.pack ?? '';

/** Same labels the app's verifier shows (`lib/near/verify.ts`). */
const CHECKS = [
  { label: 'Created by the Mosaec registry', detail: `Recorded by ${TESTNET.registryAccountId}` },
  { label: 'Zero access keys', detail: '0 keys on the account' },
  { label: 'Runs the published pack code', detail: 'Code hash matches' },
  { label: 'Predecessor authentication on', detail: 'Enabled at the verifier' },
  { label: 'Unlocked at the verifier', detail: 'No lock on this account' },
] as const;

const GUARDIAN = {
  stops: ['New packs', 'New offers', 'New fills'],
  open: ['Redeem', 'Withdraw', 'Cancel', 'Expire', 'Verify'],
} as const;

const FAQ = [
  {
    q: 'Which servers does a check trust?',
    a: 'A public NEAR RPC node and nothing else. The app reads the pack, the registry and the verifier directly from chain, and the Mosaec API plays no part.',
  },
  {
    q: 'Can the team upgrade a pack?',
    a: 'The pack contract is immutable. A new version would deploy under a new code hash, and every existing pack keeps running the code it started with.',
  },
  {
    q: 'What should I do when a check fails?',
    a: 'Treat the pack as unsafe and skip it. Each failed check names its reason, such as the key count or the code hash the account runs.',
  },
  {
    q: 'Which network is live?',
    a: `NEAR testnet, with the registry ${TESTNET.registryAccountId} and test ZEC, BTC, SOL and USDC. The mainnet registry ${NETWORKS.mainnet.registryAccountId} is the next milestone.`,
  },
] as const;

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="verify-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <Reveal trigger="load" delay={0.1}>
            <Tag
              badge="Mosaec"
              shape={<SealCheckIcon weight="fill" size={16} color="var(--ill-lime)" />}
            >
              Verify
            </Tag>
          </Reveal>
          <WordReveal
            id="verify-title"
            as="h1"
            trigger="load"
            className="t-display"
            lines={['Check every', { text: 'pack yourself.', className: 't-accent' }]}
          />
          <Reveal as="p" trigger="load" delay={0.5} className="t-body-lg">
            Paste any pack account into the app and your browser runs five checks against the chain
            before you lend or borrow.
          </Reveal>
          <Reveal trigger="load" delay={0.7} className={styles.actions}>
            <ButtonLink href="/app/verify" as={Link}>
              Verify a Pack
            </ButtonLink>
            <ButtonLink href="#rules" variant="secondary" showIcon>
              Read the Rules
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal trigger="load" delay={0.4} className={styles.checklist}>
          <div className={styles.checklistHead}>
            <AppIcon color="green" size={36}>
              <ShieldCheckIcon weight="fill" />
            </AppIcon>
            <div>
              <div className="t-label">Pack check</div>
              <div className="t-caption">NEAR Testnet</div>
            </div>
            <StatusPill tone="positive" icon={CheckIcon} className={styles.push}>
              All Passed
            </StatusPill>
          </div>
          <ol className={styles.checks}>
            {CHECKS.map((item) => (
              <li key={item.label}>
                <span className={styles.tick}>
                  <CheckIcon weight="bold" size={12} />
                </span>
                <span>
                  <span className="t-label">{item.label}</span>
                  <span className={cx('t-caption', styles.detail)}>{item.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

function KeysVisual() {
  return (
    <div className={styles.keys}>
      <AppIcon color="ink" size={52}>
        <KeyIcon weight="fill" />
      </AppIcon>
      <div className={styles.keyRows}>
        <div>
          <span>Full-access keys</span>
          <strong>0</strong>
        </div>
        <div>
          <span>Function-call keys</span>
          <strong>0</strong>
        </div>
      </div>
    </div>
  );
}

function HashVisual() {
  return (
    <div className={styles.hashCard}>
      <span className="t-caption">Published pack code hash</span>
      <code className={styles.hash}>{PACK_CODE_HASH}</code>
      <div className={styles.hashPacks}>
        {['Pack #0', 'Pack #1', 'Pack #2'].map((pack) => (
          <span key={pack} className={styles.hashPack}>
            <CheckIcon weight="bold" size={12} />
            {pack}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReleaseVisual() {
  return (
    <div className={styles.paths}>
      <div className={styles.path}>
        <AppIcon color="orange" size={32}>
          <TicketIcon weight="fill" />
        </AppIcon>
        <div>
          <div className="t-label">Ticket pays {E.repayment} USDC before T</div>
          <div className="t-caption">{E.collateral} ZEC to the Ticket holder</div>
        </div>
      </div>
      <div className={styles.path}>
        <AppIcon color="violet" size={32}>
          <LockKeyIcon weight="fill" />
        </AppIcon>
        <div>
          <div className="t-label">T passes unpaid</div>
          <div className="t-caption">{E.collateral} ZEC stays with the Title holder</div>
        </div>
      </div>
    </div>
  );
}

function GraceVisual() {
  return (
    <div className={styles.grace}>
      <div className={styles.graceTrack}>
        <span className={styles.graceWindow} />
        <span className={styles.graceExtra} />
      </div>
      <div className={styles.graceMarks}>
        <span>T - 24h</span>
        <span>T</span>
        <span>T + 24h</span>
      </div>
      <div className={styles.graceLegend}>
        <span>
          <i className={styles.dotWindow} /> Disruption recorded
        </span>
        <span>
          <i className={styles.dotExtra} /> Borrower keeps redeeming
        </span>
      </div>
    </div>
  );
}

function CapsVisual() {
  return (
    <div className={styles.caps}>
      {ASSET_SYMBOLS.map((symbol) => (
        <div key={symbol} className={styles.cap}>
          <AppIcon color="light" size={28} mark>
            <Image src={ASSET_MARK[symbol]} alt="" width={18} height={18} />
          </AppIcon>
          <span className="t-label">{ASSETS[symbol].name}</span>
          <strong>
            {formatUnits(ASSETS[symbol].capPerPack, ASSETS[symbol].decimals)} {symbol}
          </strong>
        </div>
      ))}
    </div>
  );
}

function GuardianVisual() {
  return (
    <div className={styles.guardian}>
      <div className={styles.guardCol}>
        <span className={cx('t-mono', styles.guardHead)}>
          <PauseIcon weight="fill" size={12} /> Pause stops
        </span>
        {GUARDIAN.stops.map((item) => (
          <span key={item} className={cx(styles.guardItem, styles.guardStop)}>
            {item}
          </span>
        ))}
      </div>
      <div className={styles.guardCol}>
        <span className={cx('t-mono', styles.guardHead)}>
          <CheckIcon weight="bold" size={12} /> Always open
        </span>
        {GUARDIAN.open.map((item) => (
          <span key={item} className={cx(styles.guardItem, styles.guardOpen)}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

const RULES = [
  {
    title: 'Zero keys',
    body: 'A pack has no access key of any kind. No person or team can sign for it.',
    visual: <KeysVisual />,
  },
  {
    title: 'One code hash',
    body: 'Every pack runs one global contract. Compare its hash with the published value.',
    visual: <HashVisual />,
  },
  {
    title: 'Repayment or date',
    body: 'The coins leave on the repayment before the date, or on the date itself. No price decides.',
    visual: <ReleaseVisual />,
  },
  {
    title: 'Grace on a pause',
    body: 'If the verifier pauses in the last day and someone records it, the borrower gets one more day.',
    visual: <GraceVisual />,
  },
  {
    title: 'Small caps',
    body: 'The registry refuses any pack or payment above these amounts in this release.',
    visual: <CapsVisual />,
  },
  {
    title: 'Pause-only guardian',
    body: 'The guardian can stop new pawns. It cannot move funds or change holders, terms or caps.',
    visual: <GuardianVisual />,
  },
] as const;

/** Six rules in the source's "Spend Controls" shape: a tile with a live mock, the rule below. */
function Rules() {
  return (
    <Section id="rules" label="Rules">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="1"
            shape={<ShieldCheckIcon weight="fill" size={16} color="var(--ill-green)" />}
            label="Rules"
          />
        }
        title={['Six rules,', 'each a line of code.']}
        lead="Fixed in the registry and the pack contract, the same for every lender and borrower."
      />
      <div className={styles.rules}>
        {RULES.map((rule, index) => (
          <Reveal key={rule.title} as="figure" className={styles.rule} delay={(index % 3) * 0.06}>
            <div className={styles.ruleTile}>{rule.visual}</div>
            <figcaption className={styles.ruleCaption}>
              <span className="t-h5">{rule.title}</span>
              <span className="t-body-sm">{rule.body}</span>
            </figcaption>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Node({
  icon,
  label,
  sub,
  center,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly sub: string;
  readonly center?: boolean;
}) {
  return (
    <div className={cx(styles.node, center === true && styles.nodeCenter)}>
      <span className={styles.nodeRing}>
        <AppIcon color={center === true ? 'ink' : 'light'} size={center === true ? 64 : 52}>
          {icon}
        </AppIcon>
      </span>
      <span className="t-label">{label}</span>
      <span className="t-caption">{sub}</span>
    </div>
  );
}

function Confidence() {
  return (
    <Section id="custody" label="Custody">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="2"
            shape={<CubeIcon weight="fill" size={16} color="var(--ill-violet)" />}
            label="Custody"
          />
        }
        title={['Three accounts,', 'one path for your coins.']}
      />
      <Reveal className={styles.diagram}>
        <Node icon={<WalletIcon weight="fill" />} label="Your wallet" sub="Holds the Ticket" />
        <span className={styles.wire} aria-hidden="true">
          <i />
        </span>
        <Node icon={<CubeIcon weight="fill" />} label="Pack" sub="Zero keys" center />
        <span className={styles.wire} aria-hidden="true">
          <i />
        </span>
        <Node
          icon={<ShieldCheckIcon weight="fill" />}
          label="NEAR Intents verifier"
          sub={TESTNET.verifierAccountId}
        />
      </Reveal>
      <Reveal as="p" className={cx('t-body-lg', styles.diagramNote)} delay={0.2}>
        The coins sit in the pack&apos;s own balance inside the NEAR Intents verifier. Predecessor
        authentication means only the pack contract itself can move them.
      </Reveal>
    </Section>
  );
}

const REVIEW = [
  {
    icon: <ClipboardTextIcon weight="bold" />,
    title: 'Internal Review',
    body: 'Contracts reviewed by the team',
  },
  {
    icon: <BugBeetleIcon weight="bold" />,
    title: 'External Audit',
    body: 'Planned before mainnet',
  },
  {
    icon: <FileCodeIcon weight="bold" />,
    title: 'MIT Source',
    body: 'Every contract readable',
  },
  {
    icon: <EnvelopeSimpleIcon weight="bold" />,
    title: 'Security Contact',
    body: SITE.securityEmail,
    href: `mailto:${SITE.securityEmail}`,
  },
] as const;

function Review() {
  return (
    <Section id="review" label="Review status">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="3"
            shape={<ClipboardTextIcon weight="fill" size={16} color="var(--ill-orange)" />}
            label="Review"
          />
        }
        title={['Where security stands', 'right now.']}
        lead="Where security work stands today, and the step that comes before mainnet."
      />
      <div className={styles.review}>
        {REVIEW.map((item, index) => {
          const body =
            'href' in item ? (
              <a href={item.href} className={styles.mail}>
                {item.body}
              </a>
            ) : (
              item.body
            );
          return (
            <Reveal key={item.title} className={styles.reviewItem} delay={0.05 * index}>
              <span className={styles.reviewIcon}>{item.icon}</span>
              <span className="t-h5">{item.title}</span>
              <span className="t-body-sm">{body}</span>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

export default function VerifyPage() {
  return (
    <>
      <Hero />
      <Rules />
      <Confidence />
      <Review />
      <FaqBlock title="Safety, answered." items={FAQ} />
    </>
  );
}
