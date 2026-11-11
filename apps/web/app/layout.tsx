import '@mosaec/ui/tokens.css';
import '@mosaec/ui/base.css';

import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';

import { SITE } from '../lib/site';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

const switzer = localFont({
  src: [
    { path: './fonts/Switzer-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Switzer-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Switzer-Semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-switzer',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'Mosaec: Pawn Your Coins, Keep the Upside', template: '%s | Mosaec' },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: 'website', siteName: SITE.name, url: SITE.url },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/brand/mark-black.png', apple: '/brand/mark-black.png' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${switzer.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
