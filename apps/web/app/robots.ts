import { SITE } from '../lib/site';

import type { MetadataRoute } from 'next';

/** Public pages are indexed; the app and the API proxy are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/api'] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
