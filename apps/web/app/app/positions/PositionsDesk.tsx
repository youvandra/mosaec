'use client';

import { HandCoinsIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ButtonLink, EmptyState, ErrorState, Skeleton } from '@mosaec/ui';

import { getPositions } from '../../../lib/api';
import { useNetwork } from '../../../lib/near/network';
import { useWallet } from '../../../lib/near/wallet';
import { PackTable } from '../_components/PackTable';
import { PageSection } from '../_components/PageHeader';
import { appPath } from '../_components/routes';
import { WalletButton } from '../_components/WalletButton';

import type { Positions } from '../../../lib/api';

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly positions: Positions }
  | { readonly kind: 'error' };

const SECTIONS = [
  {
    key: 'borrowing',
    title: 'Borrowing',
    note: 'You hold the Ticket. Redeem before the date to get your coins back.',
  },
  {
    key: 'lending',
    title: 'Lending',
    note: 'You hold the Title of a running pawn. You receive the repayment or the coins.',
  },
  { key: 'owned', title: 'Your packs', note: 'Free or offered packs whose Title you hold.' },
] as const;

export function PositionsDesk() {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (accountId === null) return;
    let live = true;
    setState({ kind: 'loading' });
    getPositions(network, accountId)
      .then((positions) => {
        if (live) setState({ kind: 'done', positions });
      })
      .catch(() => {
        if (live) setState({ kind: 'error' });
      });
    return () => {
      live = false;
    };
  }, [network, accountId]);

  if (accountId === null) {
    return (
      <EmptyState title="Connect a wallet" action={<WalletButton />}>
        Positions are read from the account you connect.
      </EmptyState>
    );
  }
  if (state.kind === 'loading') {
    return <Skeleton height={180} />;
  }
  if (state.kind === 'error') {
    return (
      <ErrorState title="Positions are unavailable right now">
        The indexer could not be reached. Your packs are safe on chain.
      </ErrorState>
    );
  }
  const { positions } = state;
  const total = positions.borrowing.length + positions.lending.length + positions.owned.length;
  if (total === 0) {
    return (
      <EmptyState
        title="No positions yet"
        icon={<HandCoinsIcon size={22} />}
        action={
          <ButtonLink href={appPath('/borrow')} as={Link} size="sm" showIcon>
            Open a Pawn
          </ButtonLink>
        }
      >
        Borrow against your coins, or fill an open pawn to lend.
      </EmptyState>
    );
  }
  return (
    <>
      {SECTIONS.filter((section) => positions[section.key].length > 0).map((section) => (
        <PageSection key={section.key} title={section.title}>
          <p className="t-body-sm">{section.note}</p>
          <PackTable packs={positions[section.key]} caption={section.title} />
        </PageSection>
      ))}
    </>
  );
}
