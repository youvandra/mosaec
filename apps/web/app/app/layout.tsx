import { AppProviders } from './_components/AppProviders';
import { AppShell } from './_components/AppShell';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'App', template: '%s | Mosaec' },
};

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
