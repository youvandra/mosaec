import { StorefrontIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { AppIcon, ButtonLink, ErrorState, Tag } from '@mosaec/ui';

import { liveDealOf } from '../../lib/deal';
import { exampleDeal, loadMarket } from '../../lib/market';

import { MarketStrip, RecentPawns, marketFigures } from './_components/MarketSummary';
import { OfferBook } from './_components/OfferBook';
import { OfferCard } from './_components/OfferCard';
import { PageHeader, SectionTitle } from './_components/PageHeader';
import { appPath } from './_components/routes';
import styles from './market.module.css';

export const metadata = { title: 'Market' };
export const revalidate = 15;

function EmptyBook() {
  return (
    <div className={styles.emptyTray}>
      <div className={styles.emptyCopy}>
        <AppIcon color="ink" size={48}>
          <StorefrontIcon weight="fill" />
        </AppIcon>
        <h3 className="t-h3">The book is clear.</h3>
        <p className="t-body">
          Every offer is filled. New pawns land here the moment a borrower signs.
        </p>
        <div className={styles.emptyActions}>
          <ButtonLink href={appPath('/borrow')} as={Link} showIcon>
            Open a Pawn
          </ButtonLink>
          <ButtonLink href="/lend" as={Link} variant="secondary">
            How Lending Works
          </ButtonLink>
        </div>
      </div>
      <div className={styles.emptyCard}>
        <OfferCard packId="" index="" deal={exampleDeal()} offerEndsNs={null} example />
      </div>
    </div>
  );
}

export default async function MarketPage() {
  const data = await loadMarket();
  const figures = data === null ? null : marketFigures(data);

  return (
    <>
      <PageHeader
        title="Lend against"
        accent="sealed coins."
        lead="Fill a pawn, get paid back by the date. Or keep the coins."
        actions={
          <ButtonLink href={appPath('/borrow')} as={Link} showIcon>
            Borrow Instead
          </ButtonLink>
        }
      />
      {data === null || figures === null ? (
        <ErrorState
          title="The market is unavailable right now"
          icon={<WarningCircleIcon size={22} />}
        >
          The indexer could not be reached. Every pack stays readable on the explorer, and this page
          refreshes on its own.
        </ErrorState>
      ) : (
        <>
          <MarketStrip figures={figures} />
          <OfferBook
            title={
              <SectionTitle
                tag={
                  <Tag
                    badge="1"
                    shape={<StorefrontIcon weight="fill" size={16} color="var(--ill-orange)" />}
                  >
                    Open Offers
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
          <RecentPawns figures={figures} />
        </>
      )}
    </>
  );
}
