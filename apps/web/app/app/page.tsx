import { StorefrontIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { DEFAULT_NETWORK } from '@mosaec/config/networks';
import { ButtonLink, EmptyState, ErrorState } from '@mosaec/ui';

import { listOffers, listPacks } from '../../lib/api';

import { PackTable } from './_components/PackTable';
import { PageHeader, PageSection } from './_components/PageHeader';
import { appPath } from './_components/routes';

import type { Pack } from '../../lib/api';

export const metadata = { title: 'Open Pawns' };
export const revalidate = 15;

const RECENT = 20;

async function load(): Promise<{ offers: readonly Pack[]; recent: readonly Pack[] } | null> {
  try {
    const [offers, all] = await Promise.all([
      listOffers(DEFAULT_NETWORK),
      listPacks(DEFAULT_NETWORK, 100),
    ]);
    const recent = [...all]
      .sort((a, b) => Number(BigInt(b.index) - BigInt(a.index)))
      .slice(0, RECENT);
    return { offers, recent };
  } catch {
    return null;
  }
}

export default async function MarketPage() {
  const data = await load();
  return (
    <>
      <PageHeader
        title="Open pawns"
        lead="Each row is a sealed pack whose Title is for sale. Fill one to lend: you pay the loan now and receive the repayment, or the coins, at the end of the term."
        actions={
          <ButtonLink href={appPath('/borrow')} as={Link} showIcon>
            Borrow
          </ButtonLink>
        }
      />
      {data === null ? (
        <ErrorState title="Packs are unavailable right now" icon={<WarningCircleIcon size={22} />}>
          The indexer could not be reached. Every pack stays readable on the explorer, and this page
          refreshes on its own.
        </ErrorState>
      ) : (
        <>
          {data.offers.length === 0 ? (
            <EmptyState
              title="No open pawns right now"
              icon={<StorefrontIcon size={22} />}
              action={
                <ButtonLink href={appPath('/borrow')} as={Link} size="sm" showIcon>
                  Open a Pawn
                </ButtonLink>
              }
            >
              New offers appear here seconds after a borrower signs them.
            </EmptyState>
          ) : (
            <PackTable packs={data.offers} caption="Open pawns" />
          )}
          {data.recent.length > 0 && (
            <PageSection title="Recent packs">
              <PackTable packs={data.recent} caption="Recent packs" />
            </PageSection>
          )}
        </>
      )}
    </>
  );
}
