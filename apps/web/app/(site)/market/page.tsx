import {
  ArrowsLeftRightIcon,
  CalendarCheckIcon,
  HandCoinsIcon,
  LightningIcon,
  LockKeyIcon,
  RobotIcon,
  StorefrontIcon,
  UserIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { ASSETS, assetByTokenId } from '@mosaec/config/assets';
import { DEFAULT_NETWORK } from '@mosaec/config/networks';
import {
  ButtonLink,
  ErrorState,
  Reveal,
  Section,
  StatusPill,
  Tag,
  WordReveal,
  cx,
} from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { liveDealOf } from '../../../lib/deal';
import { formatCompact, formatUnits, padCents } from '../../../lib/format';
import { exampleDeal, loadMarket } from '../../../lib/market';
import { SITE } from '../../../lib/site';
import { OfferCard } from '../../app/_components/OfferCard';
import { packPath } from '../../app/_components/routes';
import { Checkerboard, Eyebrow, FaqBlock, Journey, SectionIntro, Split, Stats } from '../_blocks';

import styles from './market.module.css';

import type { DealOutcome } from '../../../lib/deal';
import type { ActivityEntry, MarketData } from '../../../lib/market';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Market',
  description:
    'The Mosaec market: every open pawn with its loan, repayment, date and sealed coins, filled at once by the House Desk or by any lender at the borrower’s price.',
};
export const revalidate = 15;

const USDC = ASSETS.USDC;
const RECENT = 6;

function cash(amount: bigint): string {
  if (amount / 10n ** BigInt(USDC.decimals) >= 10_000n) return formatCompact(amount, USDC.decimals);
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

/** Headline numbers of the book, from the same read the app uses. */
function bookStats(data: MarketData) {
  const filled = data.activity.filter((item) => item.deal.filledAtNs !== null);
  const lent = filled.reduce(
    (sum, item) => sum + (item.deal.principal === null ? 0n : BigInt(item.deal.principal.amount)),
    0n,
  );
  const settled = data.activity.filter(
    (item) => item.deal.outcome === 'redeemed' || item.deal.outcome === 'forfeited',
  );
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  return [
    { value: data.offers.length.toString(), label: 'Open offers right now' },
    { value: `${cash(lent)} USDC`, label: 'Lent across recent pawns' },
    {
      value: settled.length === 0 ? '–' : `${repaid.toString()} of ${settled.length.toString()}`,
      label: 'Settled pawns repaid on time',
    },
  ];
}

const OUTCOME: Readonly<
  Record<DealOutcome, { label: string; tone: 'positive' | 'accent' | 'neutral' | 'warning' }>
> = {
  listed: { label: 'Open', tone: 'accent' },
  running: { label: 'Running', tone: 'accent' },
  redeemed: { label: 'Repaid', tone: 'positive' },
  forfeited: { label: 'Coins Kept', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  empty: { label: 'Empty', tone: 'neutral' },
};

function RecentRow({ entry }: { readonly entry: ActivityEntry }) {
  const line = entry.deal.collateral[0];
  const asset = line === undefined ? undefined : assetByTokenId(DEFAULT_NETWORK, line.tokenId);
  const outcome = OUTCOME[entry.deal.outcome];
  return (
    <li>
      <Link href={packPath(entry.packId)} className={styles.recentRow}>
        <span className={styles.recentPack}>
          {asset !== undefined && (
            <Image src={ASSET_MARK[asset.symbol]} alt="" width={28} height={28} />
          )}
          <span>
            <span className="t-label">Pack #{entry.index}</span>
            <span className="t-caption">
              {line === undefined || asset === undefined
                ? 'No coins sealed'
                : `${formatUnits(BigInt(line.amount), asset.decimals, 4)} ${asset.symbol}`}
            </span>
          </span>
        </span>
        <span className={styles.recentLoan}>
          {entry.deal.principal === null
            ? '–'
            : `${cash(BigInt(entry.deal.principal.amount))} USDC`}
        </span>
        <StatusPill tone={outcome.tone} dot={false}>
          {outcome.label}
        </StatusPill>
      </Link>
    </li>
  );
}

function PriceCard({
  icon,
  title,
  caption,
  rows,
  pill,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly caption: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly pill: string;
}) {
  return (
    <div className={styles.priceCard}>
      <div className={styles.priceHead}>
        <span className={styles.priceIcon}>{icon}</span>
        <span>
          <span className="t-label">{title}</span>
          <span className="t-caption">{caption}</span>
        </span>
      </div>
      <dl className={styles.priceRows}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <StatusPill tone="neutral" dot={false}>
        {pill}
      </StatusPill>
    </div>
  );
}

const FAQ = [
  {
    q: 'Who sets the price of a pawn?',
    a: 'The borrower, as a fixed repayment by a date. The House Desk quotes its own price from an hourly rate card; on the open market any lender can fill at the borrower’s price.',
  },
  {
    q: 'Who can lend?',
    a: 'Any NEAR account holding USDC: a person in the app, an agent through the public tools, or the House Desk. A fill pays the loan and moves the Title to the lender in one transaction.',
  },
  {
    q: 'What does a lender receive?',
    a: 'The repayment on or before the date, or the sealed coins when the date passes unpaid. Nothing is liquidated before then.',
  },
  {
    q: 'How long does an offer stay open?',
    a: 'Three days, or until the borrower cancels it. Moving the Title cancels it too.',
  },
  {
    q: 'Do I need a wallet to look?',
    a: 'No. This page and the app market read the book straight from NEAR. A wallet is needed only to sign.',
  },
] as const;

export default async function MarketPage() {
  const data = await loadMarket();
  const featured = data?.offers[0];
  return (
    <>
      <section className={styles.hero} aria-labelledby="market-title">
        <span className={styles.glow} aria-hidden="true" />
        <Reveal trigger="load">
          <Tag
            badge="Live"
            shape={<StorefrontIcon weight="fill" size={16} color="var(--ill-orange)" />}
          >
            Market
          </Tag>
        </Reveal>
        <WordReveal
          id="market-title"
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['One book of pawns,', { text: 'two ways to fill it.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.4} className={cx('t-body-lg', styles.lead)}>
          Each open pawn shows its loan, its repayment, its date and the coins sealed behind it. The
          House Desk fills at once; any lender can fill at the borrower&rsquo;s price.
        </Reveal>
        <Reveal trigger="load" delay={0.55} className={styles.actions}>
          <ButtonLink href={SITE.appUrl} as={Link}>
            Browse Open Pawns
          </ButtonLink>
          <ButtonLink href="/lend" as={Link} variant="secondary" showIcon>
            How Lending Works
          </ButtonLink>
        </Reveal>
      </section>

      {data === null ? (
        <Section label="Live book">
          <ErrorState
            title="The live book is unavailable right now"
            icon={<WarningCircleIcon size={22} />}
          >
            The indexer could not be reached. Every pack stays readable on the explorer, and this
            page refreshes on its own.
          </ErrorState>
        </Section>
      ) : (
        <Split
          id="book"
          label="Live book"
          copy={
            <>
              <Eyebrow
                badge="1"
                shape={<StorefrontIcon weight="fill" size={16} color="var(--ill-orange)" />}
                label="Live Book"
              />
              <WordReveal className="t-h1" lines={['Read from NEAR,', 'every fifteen seconds.']} />
              <p className="t-body-lg">
                {featured === undefined
                  ? 'Every offer is filled right now. A new pawn appears the moment a borrower signs; this is what one looks like.'
                  : 'The newest open pawn, as a lender sees it before filling.'}
              </p>
              <Stats items={bookStats(data)} />
              <div className={styles.splitActions}>
                <ButtonLink href={SITE.appUrl} as={Link} showIcon>
                  See Every Offer
                </ButtonLink>
              </div>
            </>
          }
          visual={
            <div className={styles.featured}>
              {featured === undefined ? (
                <OfferCard packId="" index="" deal={exampleDeal()} offerEndsNs={null} example />
              ) : (
                <OfferCard
                  packId={featured.id}
                  index={featured.index}
                  deal={liveDealOf(featured)}
                  offerEndsNs={featured.offer?.expiresAtNs ?? null}
                />
              )}
            </div>
          }
        />
      )}

      <Section id="fills" label="Two ways to fill">
        <SectionIntro
          layout="center"
          eyebrow={
            <Eyebrow
              badge="2"
              shape={<ArrowsLeftRightIcon weight="fill" size={16} color="var(--ill-violet)" />}
              label="Two Ways to Fill"
            />
          }
          title={['A quick answer,', 'or a better price.']}
          lead="Every pawn is the same contract either way: the loan arrives in one transaction and the coins stay sealed until the date."
        />
        <Checkerboard
          cells={[
            {
              kind: 'dark',
              icon: <LightningIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'House Desk',
              body: 'The lender Mosaec runs. It quotes from a rate card its agent sets each hour and fills the matching offer within a minute.',
            },
            {
              kind: 'light',
              visual: (
                <PriceCard
                  icon={<RobotIcon weight="fill" />}
                  title="Desk quote"
                  caption="Holds for ten minutes"
                  rows={[
                    ['Price', 'Fair rate plus 0.25% a month'],
                    ['Per loan', '10 to 250 USDC'],
                    ['Filled', 'Within a minute'],
                  ]}
                  pill="One Loan per Borrower"
                />
              ),
            },
            {
              kind: 'light',
              visual: (
                <PriceCard
                  icon={<UserIcon weight="fill" />}
                  title="Your own terms"
                  caption="Open for three days"
                  rows={[
                    ['Price', 'The repayment you set'],
                    ['Per loan', 'Up to the pack cap'],
                    ['Filled', 'By any lender or agent'],
                  ]}
                  pill="Cancel Any Time Before a Fill"
                />
              ),
            },
            {
              kind: 'dark',
              icon: <StorefrontIcon size={24} weight="fill" color="var(--ill-lime)" />,
              title: 'Open market',
              body: 'The borrower names the repayment and the date. People in the app, agents through the public tools and the desk all read the same book.',
            },
          ]}
        />
      </Section>

      <Section id="fill" label="How a fill works">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="3"
              shape={<HandCoinsIcon weight="fill" size={16} color="var(--ill-green)" />}
              label="How a Fill Works"
            />
          }
          title={['Four moves,', 'one settlement each.']}
          lead="No move depends on a price feed. The contract checks the coins and the terms, and refunds the lender when anything differs."
        />
        <Journey
          steps={[
            {
              stamp: 'Seal',
              title: 'Coins in a pack',
              body: 'The borrower moves ZEC, BTC or SOL into a keyless pack and holds its Title.',
              icon: <LockKeyIcon weight="fill" />,
              color: 'ink',
            },
            {
              stamp: 'Offer',
              title: 'Terms on the book',
              body: 'The loan, the repayment and the term go on chain beside a hash of the coins.',
              icon: <StorefrontIcon weight="fill" />,
              color: 'orange',
            },
            {
              stamp: 'Fill',
              title: 'Loan out, Title over',
              body: 'The lender pays the loan to the borrower and receives the Title in the same transaction.',
              icon: <HandCoinsIcon weight="fill" />,
              color: 'blue',
            },
            {
              stamp: 'Date',
              title: 'Repay or keep',
              body: 'The borrower repays and takes the coins back, or the lender keeps the coins after the date.',
              icon: <CalendarCheckIcon weight="fill" />,
              color: 'green',
            },
          ]}
        />
      </Section>

      {data !== null && data.activity.length > 0 && (
        <Section id="recent" label="Recent pawns">
          <SectionIntro
            layout="split"
            eyebrow={
              <Eyebrow
                badge="4"
                shape={<CalendarCheckIcon weight="fill" size={16} color="var(--ill-lime)" />}
                label="Recent Pawns"
              />
            }
            title={['How the latest', 'pawns ended.']}
            lead="Straight from the chain, newest first. Each row links to its pack in the app."
          />
          <Reveal as="ul" className={styles.recent}>
            {data.activity.slice(0, RECENT).map((entry) => (
              <RecentRow key={entry.packId} entry={entry} />
            ))}
          </Reveal>
        </Section>
      )}

      <FaqBlock title="The market, answered." items={FAQ} />
    </>
  );
}
