import { Suspense } from 'react';

import { PageHeader } from '../_components/PageHeader';

import { BorrowFlow } from './BorrowFlow';

export const metadata = { title: 'Borrow' };

export default function BorrowPage() {
  return (
    <>
      <PageHeader
        title="Borrow against"
        accent="your coins."
        lead="Lock coins, get USDC now, repay by the date."
      />
      <Suspense>
        <BorrowFlow />
      </Suspense>
    </>
  );
}
