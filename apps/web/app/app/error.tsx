'use client';

import { Button, ErrorState } from '@mosaec/ui';

export default function AppError({ reset }: { readonly error: Error; readonly reset: () => void }) {
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
