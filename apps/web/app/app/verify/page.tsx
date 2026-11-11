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
        title="Trust the chain,"
        accent="check the pack."
        lead="Paste a pack. Your browser checks it against the chain."
      />
      <Suspense>
        <VerifyPanel />
      </Suspense>
    </>
  );
}
