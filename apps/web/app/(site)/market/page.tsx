import {
  CalendarCheckIcon,
  ChartLineUpIcon,
  StorefrontIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { ButtonLink, ErrorState, Reveal, Section, Tag, WordReveal, cx } from '@mosaec/ui';

import { liveDealOf } from '../../../lib/deal';
import { exampleDeal, loadMarket } from '../../../lib/market';
import { SITE } from '../../../lib/site';
import { Activity } from '../../app/_components/Activity';
import { MarketStats } from '../../app/_components/MarketStats';
import { OfferBook } from '../../app/_components/OfferBook';
import { OfferCard } from '../../app/_components/OfferCard';
import { PageSection, SectionTitle } from '../../app/_components/PageHeader';
import { appPath } from '../../app/_components/routes';

import styles from './market.module.css';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market',
  description:
    'Open pawns on Mosaec: the loan, the repayment, the date and the coins sealed behind each one, read live from NEAR.',
};
export const revalidate = 15;

function EmptyBook() {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyCopy}>
        <h3 className="t-h3">The book is clear.</h3>
        <p className="t-body">
          Every offer is filled. A new pawn lands here the moment a borrower signs. This is what one
          looks like.
        </p>
        <ButtonLink href={appPath('/borrow')} as={Link} showIcon>
          Open a Pawn
        </ButtonLink>
      </div>
      <div className={styles.emptyCard}>
        <OfferCard packId="" index="" deal={exampleDeal()} offerEndsNs={null} example />
      </div>
    </div>
  );
}

export default async function MarketPage() {
  const data = await loadMarket();
  return (
    <>
      <section className={styles.hero} aria-label="Market">
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
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Every open pawn,', { text: 'on one page.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.4} className={cx('t-body-lg', styles.lead)}>
          The loan, the repayment, the date and the coins behind each one. Read live from NEAR, no
          wallet needed to look.
        </Reveal>
        <Reveal trigger="load" delay={0.55} className={styles.actions}>
          <ButtonLink href={SITE.appUrl} as={Link}>
            Open App
          </ButtonLink>
          <ButtonLink href="/lend" as={Link} variant="secondary" showIcon>
            How Lending Works
          </ButtonLink>
        </Reveal>
      </section>

      <Section label="Open book" className={styles.body}>
        {data === null ? (
          <ErrorState
            title="The market is unavailable right now"
            icon={<WarningCircleIcon size={22} />}
          >
            The indexer could not be reached. Every pack stays readable on the explorer, and this
            page refreshes on its own.
          </ErrorState>
        ) : (
          <>
            <MarketStats data={data} />
            <OfferBook
              title={
                <SectionTitle
                  title="Open offers"
                  tag={
                    <Tag
                      badge="1"
                      shape={<ChartLineUpIcon weight="fill" size={16} color="var(--ill-orange)" />}
                    >
                      Lend
                    </Tag>
                  }
                />
              }
              empty={<EmptyBook />}
              entries={data.offers.map((pack) => ({
                packId: pack.id,
                index: pack.index,
                deal: liveDealOf(pack),
                offerEndsNs: pack.offer?.expiresAtNs ?? null,
              }))}
            />
            {data.activity.length > 0 && (
              <PageSection
                title="Recent pawns"
                tag={
                  <Tag
                    badge="2"
                    shape={<CalendarCheckIcon weight="fill" size={16} color="var(--ill-lime)" />}
                  >
                    On Chain
                  </Tag>
                }
                lead="Every pawn so far, with how it ended."
              >
                <Activity items={data.activity} />
              </PageSection>
            )}
          </>
        )}
      </Section>
    </>
  );
}
