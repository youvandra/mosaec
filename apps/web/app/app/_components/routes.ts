/** App routes live under `/app`; the `app.` host serves the same paths. */
export const APP_ROOT = '/app';

export function appPath(path = ''): string {
  return `${APP_ROOT}${path}`;
}

export function packPath(packId: string): string {
  return appPath(`/packs/${encodeURIComponent(packId)}`);
}

export interface AppRoute {
  readonly label: string;
  readonly href: string;
  readonly icon: 'market' | 'positions' | 'balances' | 'borrow' | 'verify' | 'desk' | 'agent';
  /** A live badge the shell fills in, such as the desk loop status. */
  readonly badge?: 'desk-status';
}

/** Sidebar groups, in the source's App Panel order: group label, then its items. */
export const ROUTE_GROUPS: readonly {
  readonly title: string;
  readonly routes: readonly AppRoute[];
}[] = [
  {
    title: 'Home',
    routes: [
      { label: 'Market', href: appPath(), icon: 'market' },
      { label: 'Positions', href: appPath('/positions'), icon: 'positions' },
      { label: 'Balances', href: appPath('/balances'), icon: 'balances' },
    ],
  },
  {
    title: 'Pawn',
    routes: [
      { label: 'Borrow', href: appPath('/borrow'), icon: 'borrow' },
      { label: 'Verify', href: appPath('/verify'), icon: 'verify' },
    ],
  },
  {
    title: 'Agents',
    routes: [
      { label: 'House Desk', href: appPath('/desk'), icon: 'desk', badge: 'desk-status' },
      { label: 'Connect Agent', href: appPath('/agents'), icon: 'agent' },
    ],
  },
];

/** Five tabs fit a phone; the agent pages stay in the sidebar and the menu. */
export const PHONE_TABS: readonly AppRoute['icon'][] = [
  'market',
  'positions',
  'balances',
  'borrow',
  'verify',
];

export const ALL_ROUTES: readonly AppRoute[] = ROUTE_GROUPS.flatMap((group) => group.routes);

/** The route a pathname belongs to; the market is the fallback for pack pages. */
export function activeRoute(pathname: string): AppRoute | undefined {
  const exact = ALL_ROUTES.find((route) => route.href === pathname);
  if (exact !== undefined) return exact;
  if (pathname.startsWith(appPath('/packs/'))) return ALL_ROUTES[0];
  return [...ALL_ROUTES]
    .filter((route) => route.href !== APP_ROOT)
    .find((route) => pathname.startsWith(`${route.href}/`));
}
