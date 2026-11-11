'use client';

import { useEffect } from 'react';

import { Button, ErrorState } from '@mosaec/ui';

import { reportError } from '../../lib/report';

export default function AppError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { area: 'boundary' });
  }, [error]);
  return (
    <ErrorState
      title="This page hit an error"
      action={
        <Button size="sm" onClick={reset}>
          Try Again
        </Button>
      }
    >
      Your packs and balances are unaffected. Try again, or reload the page.
    </ErrorState>
  );
}
