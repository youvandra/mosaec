import { Suspense } from 'react';

import { PageHeader } from '../_components/PageHeader';

import { VerifyPanel } from './VerifyPanel';

export const metadata = {
  title: 'Verify',
  description: 'Check any Mosaec pack against the chain, from your browser.',
};

export default function VerifyPage() {
  return (
    <>
      <PageHeader
        title="Verify a pack"
        lead="Paste a pack account. Your browser reads the chain directly and checks the rules that keep its coins in place."
      />
      <Suspense>
        <VerifyPanel />
      </Suspense>
    </>
  );
}
