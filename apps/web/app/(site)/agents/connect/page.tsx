import {
  ArrowUpIcon,
  CalculatorIcon,
  ChatsCircleIcon,
  CoinsIcon,
  HandCoinsIcon,
  ListMagnifyingGlassIcon,
  RobotIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WalletIcon,
  WarningOctagonIcon,
  ArrowUUpLeftIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { ASSETS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import { ERROR_CATALOG } from '@mosaec/domain';
import { AppIcon, ButtonLink, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import { formatUnits, padCents } from '../../../../lib/format';
import {
  TERM_OPTIONS,
  SUGGESTED_MONTHLY_RATE_BPS,
  suggestedRepayment,
} from '../../../../lib/rates';
import { SITE } from '../../../../lib/site';
import {
  BluePanel,
  CapabilityList,
  Checkerboard,
  Eyebrow,
  FaqBlock,
  SectionIntro,
} from '../../_blocks';
import { EXAMPLE_PAWN as E, ROLLING_REPLAY } from '../../_content/facts';
import styles from '../agents.module.css';

import type { Capability } from '../../_blocks';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your Agent',
  description:
    'Bring your agent to Mosaec: it lends USDC to open pawns inside your rules and collects a fixed repayment on each date.',
};

const PROMPTS = [
  'Fill 90-day ZEC pawns paying 2.5% a month or more',
  'Keep 1,000 USDC working across open pawns',
  'Tell me when a repayment lands',
] as const;

const USDC_DECIMALS = ASSETS.USDC.decimals;
const PRINCIPAL = BigInt(E.principal.replace('.', '')) * 10n ** BigInt(USDC_DECIMALS - 2);
const ZEC_RATE = SUGGESTED_MONTHLY_RATE_BPS.ZEC ?? 0;
/** Mainnet term options, one open pack each, priced at the suggested ZEC rate. */
const usdc = (amount: bigint): string => padCents(formatUnits(amount, USDC_DECIMALS, 2));
const RESULTS = TERM_OPTIONS.filter((term) => term.testnetOnly !== true).map((term, index) => {
  const repayment = suggestedRepayment(PRINCIPAL, ZEC_RATE, term.termNs);
  return {
    pack: `Pack #${index.toString()}`,
    term: term.label,
    repayment: usdc(repayment),
    earned: usdc(repayment - PRINCIPAL),
  };
});
const CHOSEN = RESULTS[RESULTS.length - 1];
const EARNED_90 = CHOSEN?.earned ?? '';

const CAPABILITIES: readonly Capability[] = [
  {
    title: 'Find',
    body: 'The agent reads every open pawn: the coins sealed inside, the repayment and the date.',
    icon: <ListMagnifyingGlassIcon weight="fill" />,
    color: 'blue',
  },
  {
    title: 'Price',
    body: `Each repayment is checked against your floor rate. A ${E.termDays.toString()}-day ZEC pawn at ${E.monthlyRate} a month returns ${EARNED_90} USDC on ${E.principal}.`,
    icon: <CalculatorIcon weight="fill" />,
    color: 'violet',
  },
  {
    title: 'Lend',
    body: 'The agent pays the principal and the Title, the claim on the coins, settles to your wallet in the same transaction.',
    icon: <HandCoinsIcon weight="fill" />,
    color: 'green',
  },
  {
    title: 'Collect',
    body: 'The borrower repays by the date and the USDC lands in your wallet. When the date passes unpaid, the coins are yours.',
    icon: <CoinsIcon weight="fill" />,
    color: 'orange',
  },
];

const FAQ = [
  {
    q: 'How much does an agent earn?',
    a: `The borrower sets the repayment at fill and it never moves. At the suggested ZEC rate of ${E.monthlyRate} a month, ${E.principal} USDC lent for ${E.termDays.toString()} days comes back as ${E.repayment} USDC.`,
  },
  {
    q: 'What if the borrower never repays?',
    a: `The coins in the pack become yours, worth about twice the loan at fill. Across every ${ROLLING_REPLAY.termDays.toString()}-day ZEC start from ${ROLLING_REPLAY.span} at ${ROLLING_REPLAY.ltv} LTV, ${ROLLING_REPLAY.pawnForfeit} of pawns ended this way.`,
  },
  {
    q: 'Can I exit before the date?',
    a: 'The Title is an NFT, so another lender can buy it at any time. The buyer collects the repayment or the coins.',
  },
  {
    q: 'How is this different from the House Desk?',
    a: 'The House Desk is the lender Mosaec runs with its own budget. Your agent lends your money, inside your rules, through the same public tools.',
  },
  {
    q: 'When do I get paid?',
    a: 'When the borrower repays, on or before the date. The repayment lands in the pack the Title owns, and one withdraw moves it to your balance.',
  },
  {
    q: 'Which network does an agent use?',
    a: `NEAR testnet, against the registry ${NETWORKS.testnet.registryAccountId} with test ZEC, BTC, SOL and USDC. The mainnet registry ${NETWORKS.mainnet.registryAccountId} is the next milestone.`,
  },
] as const;

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="agents-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.heroContent}>
        <Reveal trigger="load" delay={0.1}>
          <Tag badge="Mosaec" shape={<RobotIcon weight="fill" size={16} color="var(--ill-lime)" />}>
            Your Agent
          </Tag>
        </Reveal>
        <WordReveal
          id="agents-title"
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={[
            'Bring your agent.',
            { text: 'It earns while you sleep.', className: 't-accent' },
          ]}
        />
        <Reveal as="p" trigger="load" delay={0.5} className={cx('t-body-lg', styles.lead)}>
          Your agent reads the open pawns, fills the ones inside your rules and collects a fixed
          repayment on each date. Coins worth about twice the loan back every one.
        </Reveal>
        <Reveal trigger="load" delay={0.65} className={styles.promptWrap}>
          <div className={styles.prompt} aria-label="Example prompt">
            <SparkleIcon size={18} weight="fill" className={styles.promptIcon} />
            <span className={styles.promptText}>{PROMPTS[0]}</span>
            <span className={styles.send} aria-hidden="true">
              <ArrowUpIcon size={16} weight="bold" />
            </span>
          </div>
          <ul className={styles.chips} aria-label="More example prompts">
            {PROMPTS.map((prompt) => (
              <li key={prompt} className={styles.chip}>
                <ChatsCircleIcon size={14} weight="bold" />
                {prompt}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal trigger="load" delay={0.8} className={styles.actions}>
          <ButtonLink href={SITE.appUrl} as={Link}>
            Open App
          </ButtonLink>
          <ButtonLink href="/rates" as={Link} variant="secondary" showIcon>
            See the Rates
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

const CAP_LINES = (['ZEC', 'BTC', 'SOL'] as const).map(
  (symbol) => `${formatUnits(ASSETS[symbol].capPerPack, ASSETS[symbol].decimals)} ${symbol}`,
);

function RefusalCard() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <AppIcon color="coral" size={36}>
          <WarningOctagonIcon weight="fill" />
        </AppIcon>
        <div>
          <div className="t-label">Fill refused</div>
          <div className="t-caption">parseOutcome(tx)</div>
        </div>
      </div>
      <code className={styles.codeChip}>E_TERMS</code>
      <p className="t-body-sm">{ERROR_CATALOG.E_TERMS.message}</p>
      <div className={styles.cardFoot}>
        <StatusPill tone="positive" icon={ArrowUUpLeftIcon}>
          USDC Refunded
        </StatusPill>
        <span className="t-caption">HTTP {ERROR_CATALOG.E_TERMS.httpStatus.toString()}</span>
      </div>
    </div>
  );
}

function PolicyCard() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <AppIcon color="ink" size={36}>
          <WalletIcon weight="fill" />
        </AppIcon>
        <div>
          <div className="t-label">Your rules</div>
          <div className="t-caption">Checked before every fill</div>
        </div>
        <StatusPill tone="neutral" dot={false} className={styles.push}>
          Example
        </StatusPill>
      </div>
      <dl className={styles.policy}>
        <div>
          <dt>Floor rate</dt>
          <dd>{E.monthlyRate} a month</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>1,000 USDC</dd>
        </div>
        <div>
          <dt>Max per pawn</dt>
          <dd>{CAP_LINES.join(' / ')}</dd>
        </div>
        <div>
          <dt>Pays up to</dt>
          <dd>{formatUnits(ASSETS.USDC.capPerPack, USDC_DECIMALS)} USDC</dd>
        </div>
        <div>
          <dt>Terms accepted</dt>
          <dd>{RESULTS.map((r) => r.term).join(', ')}</dd>
        </div>
      </dl>
      <div className={styles.cardFoot}>
        <code className={styles.codeChip}>DESK_BUDGET</code>
        <span className="t-caption">{ERROR_CATALOG.DESK_BUDGET.message}</span>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <>
      <Hero />
      <Section id="capabilities" label="Capabilities">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="1"
              shape={<SparkleIcon weight="fill" size={16} color="var(--ill-violet)" />}
              label="Where It Earns"
            />
          }
          title={['Four steps,', 'one fixed return.']}
          lead="A borrower pawns coins for USDC and agrees the repayment at fill. The difference is the lender's return, set before any coin moves."
        />
        <CapabilityList items={CAPABILITIES} />
      </Section>
      <Section id="guardrails" label="Guardrails">
        <SectionIntro
          layout="center"
          eyebrow={
            <Eyebrow
              badge="2"
              shape={<ShieldCheckIcon weight="fill" size={16} color="var(--ill-green)" />}
              label="Guardrails"
            />
          }
          title={['Your rules', 'cap every loss.']}
        />
        <Checkerboard
          cells={[
            {
              kind: 'dark',
              icon: <WarningOctagonIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'A bad fill costs nothing',
              body: 'Any mismatch in coins, terms or amount refunds the USDC in the same settlement. The agent reads the reason as a code and moves to the next pawn.',
            },
            { kind: 'light', visual: <RefusalCard /> },
            { kind: 'light', visual: <PolicyCard /> },
            {
              kind: 'dark',
              icon: <WalletIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'Budget and floor set by you',
              body: 'You set the budget, the floor rate and the size per pawn. The server checks them before it signs, and the registry enforces the per-pack caps again on chain.',
            },
          ]}
        />
      </Section>
      <BluePanel
        icon={<ShieldCheckIcon weight="fill" />}
        title="Rules in code, never in a prompt."
        body="Policy lives in the desk server and the contracts. A prompt changes the words an agent says; the limits stay exactly where the code put them."
        pills={['Per-Pack Caps', 'Desk Budget', 'Server-Side Policy', 'On-Chain Checks']}
      />
      <FaqBlock title="Agents, answered." items={FAQ} />
    </>
  );
}
