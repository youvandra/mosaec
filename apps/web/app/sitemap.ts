import { SITE } from '../lib/site';

import type { MetadataRoute } from 'next';

const PAGES: readonly { path: string; priority: number }[] = [
  { path: '', priority: 1 },
  { path: '/borrow', priority: 0.8 },
  { path: '/lend', priority: 0.8 },
  { path: '/market', priority: 0.8 },
  { path: '/agents', priority: 0.7 },
  { path: '/agents/connect', priority: 0.6 },
  { path: '/rates', priority: 0.7 },
  { path: '/verify', priority: 0.6 },
  { path: '/docs', priority: 0.6 },
  { path: '/about', priority: 0.5 },
  { path: '/terms', priority: 0.2 },
  { path: '/privacy', priority: 0.2 },
  { path: '/risks', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: `${SITE.url}${page.path}`,
    changeFrequency: 'weekly',
    priority: page.priority,
  }));
}
