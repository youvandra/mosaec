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
  readonly icon: 'market' | 'positions' | 'borrow' | 'verify';
}

export const ROUTE_GROUPS: readonly {
  readonly title: string;
  readonly routes: readonly AppRoute[];
}[] = [
  { title: 'Market', routes: [{ label: 'Open Pawns', href: appPath(), icon: 'market' }] },
  {
    title: 'Desk',
    routes: [{ label: 'Positions', href: appPath('/positions'), icon: 'positions' }],
  },
  {
    title: 'Tools',
    routes: [
      { label: 'Borrow', href: appPath('/borrow'), icon: 'borrow' },
      { label: 'Verify', href: appPath('/verify'), icon: 'verify' },
    ],
  },
];

export const ALL_ROUTES = ROUTE_GROUPS.flatMap((group) => group.routes);

/** The route a pathname belongs to; the market is the fallback for pack pages. */
export function activeRoute(pathname: string): AppRoute | undefined {
  const exact = ALL_ROUTES.find((route) => route.href === pathname);
  if (exact !== undefined) return exact;
  return [...ALL_ROUTES]
    .filter((route) => route.href !== APP_ROOT)
    .find((route) => pathname.startsWith(`${route.href}/`));
}
