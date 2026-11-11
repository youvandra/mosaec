import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

/** The app lives on its own host; locally it is served under `/app`. */
const APP_HOST_PREFIX = 'app.';
const APP_PATH = '/app';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (!host.startsWith(APP_HOST_PREFIX)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  if (url.pathname === APP_PATH || url.pathname.startsWith(`${APP_PATH}/`)) {
    return NextResponse.next();
  }
  url.pathname = `${APP_PATH}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/|brand/|tokens/|favicon|robots.txt|sitemap.xml|.well-known/).*)'],
};
