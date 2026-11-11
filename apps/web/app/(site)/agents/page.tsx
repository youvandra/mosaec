import {
  ArrowUpIcon,
  BinocularsIcon,
  BrowserIcon,
  CalculatorIcon,
  ChatsCircleIcon,
  CodeIcon,
  HandCoinsIcon,
  ListMagnifyingGlassIcon,
  RobotIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TicketIcon,
  WalletIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { ASSETS } from '@mosaec/config/assets';
import { ERROR_CATALOG } from '@mosaec/domain';
import { AppIcon, ButtonLink, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import { formatUnits, padCents } from '../../../lib/format';
import { TERM_OPTIONS, SUGGESTED_MONTHLY_RATE_BPS, suggestedRepayment } from '../../../lib/rates';
import { SITE } from '../../../lib/site';
import {
  BluePanel,
  CapabilityList,
  Checkerboard,
  Eyebrow,
  FaqBlock,
  SectionIntro,
} from '../_blocks';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './agents.module.css';

import type { Capability } from '../_blocks';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agents',
  description:
    'Mosaec pawns are a fixed repayment, a date and typed refusals: rules an agent reads from the API and signs with the SDK.',
};

const PROMPTS = [
  'Quote a 90-day pawn on 1 ZEC',
  'List open pawns under 2.5% a month',
  'Redeem pack #2 before the date',
] as const;

const USDC_DECIMALS = ASSETS.USDC.decimals;
const PRINCIPAL = BigInt(E.principal.replace('.', '')) * 10n ** BigInt(USDC_DECIMALS - 2);
const ZEC_RATE = SUGGESTED_MONTHLY_RATE_BPS.ZEC ?? 0;
/** Mainnet term options, one open pack each, priced at the suggested ZEC rate. */
const RESULTS = TERM_OPTIONS.filter((term) => term.testnetOnly !== true).map((term, index) => ({
  pack: `Pack #${index.toString()}`,
  term: term.label,
  repayment: padCents(
    formatUnits(suggestedRepayment(PRINCIPAL, ZEC_RATE, term.termNs), USDC_DECIMALS, 2),
  ),
}));

const SOURCES = [
  { call: 'GET /offers?network=testnet', note: 'Open packs, contents and terms' },
  { call: 'GET /packs/:id?network=testnet', note: 'One pack with its history' },
  { call: 'new MosaecViews("testnet").positionOf(pack)', note: 'The offer, read from chain' },
  { call: 'mosaecCalls("testnet").fill(...)', note: 'Exact call for the wallet' },
] as const;

const CAPABILITIES: readonly Capability[] = [
  {
    title: 'List',
    body: 'list_offers returns every open pack with its contents, repayment and term. GET /offers serves the same rows today.',
    icon: <ListMagnifyingGlassIcon weight="fill" />,
    color: 'blue',
  },
  {
    title: 'Quote',
    body: 'quote_offer prices a pack against the desk policy. The SDK helpers aprBps and repaymentFor run the same arithmetic in any agent today.',
    icon: <CalculatorIcon weight="fill" />,
    color: 'violet',
  },
  {
    title: 'Fill',
    body: 'fill_offer pays the principal with the contents hash the agent read. The builder behind it, mosaecCalls().fill, ships in the SDK now.',
    icon: <HandCoinsIcon weight="fill" />,
    color: 'green',
  },
  {
    title: 'Watch',
    body: 'The indexer feed reports fills, redemptions and expiries per pack. GET /packs/:id returns that history today; the push feed is planned.',
    icon: <BinocularsIcon weight="fill" />,
    color: 'orange',
  },
];

const FAQ = [
  {
    q: 'Is the house desk live?',
    a: 'The desk is in development. Today any agent can read the API, build exact calls with the SDK, verify packs and read typed refusal codes.',
  },
  {
    q: 'Which network does an agent use?',
    a: 'NEAR testnet, against the registry v0.mosaec.testnet with test ZEC and USDC. The mainnet registry v0.mosaec.near is the next milestone.',
  },
  {
    q: 'Does an agent need a price feed?',
    a: 'A pawn has zero oracle and zero liquidation. The repayment and the date are fixed at fill, so an agent reasons about two numbers and one deadline.',
  },
  {
    q: 'What happens when a fill goes wrong?',
    a: 'Fill settles through one receipt chain. Any mismatch in contents, terms or amount sends the USDC back to the lender in full, and parseOutcome reads the reason as a catalog code.',
  },
  {
    q: 'Can an agent hold a Ticket or a Title?',
    a: 'Both are NFTs on the registry, so any NEAR account can hold, transfer or sell them. An agent holding a Ticket redeems with mosaecCalls().exercise before the date.',
  },
] as const;

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="agents-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.heroContent}>
        <Reveal trigger="load" delay={0.1}>
          <Tag badge="Mosaec" shape={<RobotIcon weight="fill" size={16} color="var(--ill-lime)" />}>
            Agents
          </Tag>
        </Reveal>
        <WordReveal
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Pawn rules', { text: 'an agent can read.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.5} className={cx('t-body-lg', styles.lead)}>
          Every Mosaec pawn is a fixed repayment, a date and a typed answer. Lending and borrowing
          run on autopilot when the rules live in code.
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
          <ButtonLink href="/developers#sdk" as={Link}>
            Read the SDK
          </ButtonLink>
          <ButtonLink href={SITE.appUrl} as={Link} variant="secondary" showIcon>
            Open App
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

function DeskMark() {
  return (
    <span className={styles.deskMark} aria-hidden="true">
      <RobotIcon size={14} weight="fill" />
    </span>
  );
}

function Conversation() {
  return (
    <Section id="desk" label="House desk">
      <SectionIntro
        layout="center"
        eyebrow={
          <Eyebrow
            badge="1"
            shape={<ChatsCircleIcon weight="fill" size={16} color="var(--ill-orange)" />}
            label="House Desk"
          />
        }
        title={['Ask the desk,', { text: 'get a signed answer.', className: 't-accent' }]}
        lead="The house lending desk is a budget-capped lender run by the team. Below is how it reads the book, built from live endpoints and SDK calls."
      />
      <Reveal className={styles.window}>
        <div className={styles.windowBar}>
          <span className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={styles.url}>
            <BrowserIcon size={12} weight="bold" />
            desk.mosaec.near
          </span>
          <StatusPill tone="warning">In Development</StatusPill>
        </div>
        <div className={styles.windowBody}>
          <div className={styles.thread}>
            <p className={styles.ask}>
              Show open ZEC pawns on testnet at {E.monthlyRate} a month or less.
            </p>
            <div className={styles.reply}>
              <DeskMark />
              <p className="t-body-sm">
                Three open packs match. Each holds {E.collateral} ZEC against {E.principal} USDC and
                repays by a fixed date.
              </p>
            </div>
            <div className={styles.results}>
              {RESULTS.map((result) => (
                <div key={result.pack} className={styles.result}>
                  <div className={styles.resultHead}>
                    <span className="t-label">{result.pack}</span>
                    <StatusPill tone="accent" dot={false}>
                      Open
                    </StatusPill>
                  </div>
                  <span className={cx('t-h3', styles.resultValue)}>{E.collateral} ZEC</span>
                  <dl className={styles.resultMeta}>
                    <div>
                      <dt>Repayment</dt>
                      <dd>{result.repayment} USDC</dd>
                    </div>
                    <div>
                      <dt>Term</dt>
                      <dd>{result.term}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <p className={styles.ask}>Fill pack #2.</p>
            <div className={styles.reply}>
              <DeskMark />
              <p className="t-body-sm">
                Call built for the desk wallet. The Title moves on settle.
              </p>
            </div>
            <div className={styles.callRows}>
              <div className={styles.callRow}>
                <span className="t-label">Pays</span>
                <span className={styles.mono}>{E.principal} USDC</span>
              </div>
              <div className={styles.callRow}>
                <span className="t-label">Method</span>
                <span className={styles.mono}>mt_transfer_call</span>
              </div>
            </div>
          </div>
          <aside className={styles.sources} aria-label="Sources">
            <span className="t-mono">Sources</span>
            {SOURCES.map((source) => (
              <div key={source.call} className={styles.source}>
                <CodeIcon size={16} weight="bold" className={styles.sourceIcon} />
                <div>
                  <code className={styles.sourceCall}>{source.call}</code>
                  <span className="t-caption">{source.note}</span>
                </div>
              </div>
            ))}
          </aside>
        </div>
      </Reveal>
      <Reveal as="p" className={cx('t-caption', styles.note)} delay={0.2}>
        Illustration of the house desk while it is built. Every source on the right works today.
      </Reveal>
    </Section>
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
        <StatusPill tone="positive">USDC Refunded</StatusPill>
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
          <div className="t-label">Desk policy</div>
          <div className="t-caption">desk.mosaec.near</div>
        </div>
        <StatusPill tone="neutral" dot={false} className={styles.push}>
          Policy Shape
        </StatusPill>
      </div>
      <dl className={styles.policy}>
        <div>
          <dt>Budget</dt>
          <dd>Set by the team</dd>
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
      <Conversation />
      <Section id="capabilities" label="Capabilities">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="2"
              shape={<SparkleIcon weight="fill" size={16} color="var(--ill-violet)" />}
              label="Capabilities"
            />
          }
          title={['Four tools,', 'one pawn book.']}
          lead="The desk speaks MCP with three tools and one feed. Each maps to an SDK call or API route an agent can use on its own today."
        />
        <CapabilityList items={CAPABILITIES} />
      </Section>
      <Section id="guardrails" label="Guardrails">
        <SectionIntro
          layout="center"
          eyebrow={
            <Eyebrow
              badge="3"
              shape={<ShieldCheckIcon weight="fill" size={16} color="var(--ill-green)" />}
              label="Guardrails"
            />
          }
          title={['Limits an agent', 'reads as data.']}
        />
        <Checkerboard
          cells={[
            {
              kind: 'dark',
              icon: <WarningOctagonIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'Typed refusals',
              body: 'A contract that declines answers with a catalog code and a plain message. The agent branches on the code and skips parsing prose.',
            },
            { kind: 'light', visual: <RefusalCard /> },
            { kind: 'light', visual: <PolicyCard /> },
            {
              kind: 'dark',
              icon: <TicketIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'Budget-capped desk',
              body: 'The desk lends from a fixed budget with a cap per pawn. The server checks policy before it signs, and the registry enforces the per-pack caps again on chain.',
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
