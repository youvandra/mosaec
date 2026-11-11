import { CompassIcon, LockKeyIcon, TicketIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { AppIcon, ButtonLink, Tag } from '@mosaec/ui';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '0 20px',
        textAlign: 'center',
        background: 'linear-gradient(180deg, #ededed 0%, #ffffff 100%)',
      }}
    >
      <div style={{ display: 'flex', gap: 12 }} aria-hidden="true">
        <AppIcon color="ink" size={56}>
          <LockKeyIcon weight="fill" />
        </AppIcon>
        <AppIcon color="orange" size={56}>
          <TicketIcon weight="fill" />
        </AppIcon>
        <AppIcon color="blue" size={56}>
          <CompassIcon weight="fill" />
        </AppIcon>
      </div>
      <Tag badge="404">Not Found</Tag>
      <h1 className="t-h1">This page is off the map.</h1>
      <p className="t-body-lg">The address may have changed. Every pack stays on chain.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <ButtonLink href="/" as={Link}>
          Go Home
        </ButtonLink>
        <ButtonLink href="/app" as={Link} variant="secondary" showIcon>
          Open App
        </ButtonLink>
      </div>
    </main>
  );
}
