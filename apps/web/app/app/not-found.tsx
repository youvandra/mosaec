import Link from 'next/link';

import { ButtonLink, EmptyState } from '@mosaec/ui';

import { appPath } from './_components/routes';

export default function AppNotFound() {
  return (
    <EmptyState
      title="No such pack or page"
      action={
        <ButtonLink href={appPath()} as={Link} size="sm" showIcon>
          Back to Open Pawns
        </ButtonLink>
      }
    >
      The indexer has no record of it. New packs appear within seconds of being minted.
    </EmptyState>
  );
}
