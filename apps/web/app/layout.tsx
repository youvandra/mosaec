import '@mosaec/ui/tokens.css';
import '@mosaec/ui/base.css';

import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';

import { ConfirmProvider, PageLoader, SmoothScroll, ToastProvider } from '@mosaec/ui';

import { SITE } from '../lib/site';

import { Analytics } from './Analytics';

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
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${switzer.variable} ${GeistMono.variable}`}
    >
      <head>
        {/* Load animations run only in a visible tab and are dropped after 2.4 s, so content never waits on them. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(document.visibilityState==='visible'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var h=document.documentElement;h.classList.add('motion-ok');setTimeout(function(){h.classList.remove('motion-ok')},2400)}",
          }}
        />
      </head>
      <body>
        <PageLoader />
        <SmoothScroll />
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
