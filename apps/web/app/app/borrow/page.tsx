import { Suspense } from 'react';

import { PageHeader } from '../_components/PageHeader';

import { BorrowFlow } from './BorrowFlow';

export const metadata = { title: 'Borrow' };

export default function BorrowPage() {
  return (
    <>
      <PageHeader
        title="Borrow against your coins"
        lead="Seal coins in a pack, name the loan and sign the offer. A lender fills it, you receive USDC and the Ticket, and you buy the coins back by the date."
      />
      <Suspense>
        <BorrowFlow />
      </Suspense>
    </>
  );
}
