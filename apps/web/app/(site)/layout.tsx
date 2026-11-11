import Link from 'next/link';

import { Navigation } from '@mosaec/ui';

import { SITE } from '../../lib/site';

import { NAV_MENUS } from './_components/nav-config';
import { RouteCurtain } from './_components/RouteCurtain';
import { Footer } from './_sections/Footer';

import type { ReactNode } from 'react';

export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Navigation
        menus={NAV_MENUS}
        homeHref="/"
        cta={{ label: 'Open App', href: SITE.appUrl }}
        linkAs={Link}
      />
      <main id="main">{children}</main>
      <Footer />
      <RouteCurtain />
    </>
  );
}
