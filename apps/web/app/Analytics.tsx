import Script from 'next/script';

import { SITE } from '../lib/site';

/**
 * Self-hosted Umami: cookie-free page views plus the funnel steps in `lib/track`. Loads only
 * when its URL and site id are set, honours Do Not Track, and counts only on the real domain.
 */
export function Analytics() {
  const url = process.env.NEXT_PUBLIC_UMAMI_URL;
  const site = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (url === undefined || url === '' || site === undefined || site === '') return null;
  const host = new URL(SITE.url).hostname;
  return (
    <Script
      src={`${url.replace(/\/$/, '')}/script.js`}
      data-website-id={site}
      data-domains={`${host},app.${host}`}
      data-do-not-track="true"
      strategy="afterInteractive"
    />
  );
}
