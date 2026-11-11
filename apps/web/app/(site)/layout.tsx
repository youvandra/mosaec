import Link from 'next/link';

import { Navigation } from '@mosaec/ui';

import { SITE } from '../../lib/site';

import { Footer } from './_sections/Footer';

import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { label: 'How It Works', href: '/#how' },
  { label: 'Safety', href: '/#safety' },
  { label: 'Assets', href: '/#assets' },
  { label: 'FAQ', href: '/#faq' },
] as const;

export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Navigation
        items={NAV_ITEMS}
        homeHref="/"
        cta={{ label: 'Open App', href: SITE.appUrl }}
        linkAs={Link}
      />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
