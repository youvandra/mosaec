'use client';

import {
  BellRingingIcon,
  CoinVerticalIcon,
  HandCoinsIcon,
  PlugsConnectedIcon,
  RobotIcon,
  SealCheckIcon,
  StorefrontIcon,
  TicketIcon,
  WalletIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo, Tooltip, cx } from '@mosaec/ui';

import { DESK_STATUS_LABEL } from '../../../lib/desk-status';

import styles from './AppShell.module.css';
import { Countdown } from './Countdown';
import { NetworkToggle } from './NetworkToggle';
import { ALL_ROUTES, PHONE_TABS, ROUTE_GROUPS, activeRoute, appPath } from './routes';
import { useDeskStatus } from './useDeskStatus';
import { useDueSoon } from './useDueSoon';
import { WalletButton } from './WalletButton';

import type { AppRoute } from './routes';
import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

const ICONS: Readonly<Record<AppRoute['icon'], Icon>> = {
  market: StorefrontIcon,
  positions: TicketIcon,
  balances: WalletIcon,
  borrow: HandCoinsIcon,
  verify: SealCheckIcon,
  desk: RobotIcon,
  agent: PlugsConnectedIcon,
};

/**
 * The source's App Panel: a dark sidebar (logo, grouped items, user row) beside a light main
 * column with a slim top bar. Phones get a top bar and a glass tab bar instead.
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const active = activeRoute(pathname);
  const onFaucet = pathname.startsWith(appPath('/faucet'));
  /* The breadcrumb names the sidebar group, as a folder: it is a label, not a link. */
  const group = onFaucet
    ? 'Testnet'
    : (ROUTE_GROUPS.find((item) => item.routes.some((route) => route === active))?.title ?? 'Home');
  const desk = useDeskStatus();
  const due = useDueSoon();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="App">
        <Link href="/" className={styles.brand} aria-label="Mosaec home">
          <Logo tone="light" />
        </Link>
        {ROUTE_GROUPS.map((group) => (
          <nav key={group.title} className={styles.group} aria-label={group.title}>
            <span className={styles.groupTitle}>{group.title}</span>
            {group.routes.map((route) => {
              const current = active?.href === route.href;
              const Glyph = ICONS[route.icon];
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={styles.item}
                  aria-current={current ? 'page' : undefined}
                >
                  <Glyph size={16} weight={current ? 'fill' : 'regular'} />
                  <span className={styles.itemLabel}>{route.label}</span>
                  {route.icon === 'positions' && due.count > 0 && (
                    <span className={cx(styles.badge, styles.badgeDue)}>
                      {due.count.toString()} due
                    </span>
                  )}
                  {route.badge === 'desk-status' && desk !== null && (
                    <span className={cx(styles.badge, desk !== 'live' && styles.badgeMuted)}>
                      {DESK_STATUS_LABEL[desk]}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        ))}
        <nav className={styles.group} aria-label="Testnet">
          <span className={styles.groupTitle}>Testnet</span>

          <Link
            href={appPath('/faucet')}
            className={styles.item}
            aria-current={pathname === appPath('/faucet') ? 'page' : undefined}
          >
            <CoinVerticalIcon size={16} />
            <span className={styles.itemLabel}>Test Tokens</span>
          </Link>
        </nav>
        <div className={styles.fill} />
        <div className={styles.foot}>
          <WalletButton appearance="sidebar" />
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.phoneBrand} aria-label="Mosaec home">
            <Logo variant="mark" />
          </Link>
          <nav aria-label="Breadcrumb" className={styles.title}>
            <span className={styles.crumbGroup}>{group}</span>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span aria-current="page">
              {active?.label ??
                (onFaucet
                  ? 'Test Tokens'
                  : pathname.startsWith(appPath('/packs/'))
                    ? 'Pack'
                    : 'Mosaec')}
            </span>
          </nav>
          <div className={styles.actions}>
            {due.count > 0 && due.firstNs !== null && (
              <Tooltip label="Repay before the date or the lender keeps the coins." side="bottom">
                <Link href={appPath('/positions')} className={styles.duePill}>
                  <BellRingingIcon size={16} weight="fill" />
                  <span>
                    {due.count === 1 ? '1 pawn due' : `${due.count.toString()} pawns due`} in{' '}
                    <Countdown untilNs={due.firstNs} compact />
                  </span>
                </Link>
              </Tooltip>
            )}
            <NetworkToggle />
            <span className={styles.phoneWallet}>
              <WalletButton label="Connect" />
            </span>
          </div>
        </header>
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>

      <nav className={styles.tabbar} aria-label="App">
        {ALL_ROUTES.filter((route) => PHONE_TABS.includes(route.icon)).map((route) => {
          const current = active?.href === route.href;
          const Glyph = ICONS[route.icon];
          return (
            <Link
              key={route.href}
              href={route.href}
              className={styles.tab}
              aria-current={current ? 'page' : undefined}
            >
              <Glyph size={20} weight={current ? 'fill' : 'regular'} />
              {route.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
