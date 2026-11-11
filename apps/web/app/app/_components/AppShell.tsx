'use client';

import { HandCoinsIcon, SealCheckIcon, StorefrontIcon, WalletIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo, cx } from '@mosaec/ui';

import styles from './AppShell.module.css';
import { NetworkToggle } from './NetworkToggle';
import { ALL_ROUTES, ROUTE_GROUPS, activeRoute } from './routes';
import { WalletButton } from './WalletButton';

import type { AppRoute } from './routes';
import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

const ICONS: Readonly<Record<AppRoute['icon'], Icon>> = {
  market: StorefrontIcon,
  positions: WalletIcon,
  borrow: HandCoinsIcon,
  verify: SealCheckIcon,
};

function RouteIcon({
  route,
  active,
  size,
}: {
  readonly route: AppRoute;
  readonly active: boolean;
  readonly size: number;
}) {
  const Glyph = ICONS[route.icon];
  return <Glyph size={size} weight={active ? 'fill' : 'regular'} />;
}

/** Sidebar, top bar and phone tab bar around every app page. */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const active = activeRoute(pathname);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="App">
        <Link href="/" className={styles.brand} aria-label="Mosaec home">
          <Logo size={36} />
        </Link>
        {ROUTE_GROUPS.map((group) => (
          <nav key={group.title} className={styles.group} aria-label={group.title}>
            <span className={styles.groupTitle}>{group.title}</span>
            {group.routes.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                className={styles.link}
                aria-current={active?.href === route.href ? 'page' : undefined}
              >
                <RouteIcon route={route} active={active?.href === route.href} size={18} />
                {route.label}
              </Link>
            ))}
          </nav>
        ))}
        <div className={styles.sidebarFoot}>
          <NetworkToggle />
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.mobileBrand} aria-label="Mosaec home">
            <Logo variant="mark" size={36} />
          </Link>
          <span className={cx('t-h4', styles.pageTitle)}>{active?.label ?? 'Pack'}</span>
          <div className={styles.topActions}>
            <WalletButton />
          </div>
        </header>
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
      <nav className={styles.tabbar} aria-label="App">
        {ALL_ROUTES.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={styles.tab}
            aria-current={active?.href === route.href ? 'page' : undefined}
          >
            <RouteIcon route={route} active={active?.href === route.href} size={20} />
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
