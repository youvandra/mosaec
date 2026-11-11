import {
  CalendarCheckIcon,
  ChartBarIcon,
  HandCoinsIcon,
  SealCheckIcon,
} from '@phosphor-icons/react/dist/ssr';

import { AppIcon } from '@mosaec/ui';

import { SITE } from '../../../lib/site';

import type { NavMenu } from '@mosaec/ui';

const TILE = 40;

export const NAV_MENUS: readonly NavMenu[] = [
  {
    label: 'Product',
    panel: {
      eyebrow: 'Products',
      items: [
        {
          title: 'Borrow',
          caption: 'USDC against ZEC, no liquidation',
          href: '/borrow',
          icon: (
            <AppIcon color="blue" size={TILE}>
              <HandCoinsIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Lend',
          caption: 'A fixed repayment, coins as backstop',
          href: '/lend',
          icon: (
            <AppIcon color="lime" size={TILE}>
              <CalendarCheckIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Rates',
          caption: 'Plans per asset and term',
          href: '/rates',
          icon: (
            <AppIcon color="orange" size={TILE}>
              <ChartBarIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Verify',
          caption: 'Check any pack against the chain',
          href: '/verify',
          icon: (
            <AppIcon color="green" size={TILE}>
              <SealCheckIcon weight="fill" />
            </AppIcon>
          ),
        },
      ],
      footer: { badge: 'New', text: 'ZEC packs are live on NEAR testnet.', href: SITE.appUrl },
    },
  },
  { label: 'Market', href: '/market' },
  { label: 'Agents', href: '/agents' },
  { label: 'Docs', href: '/docs' },
  { label: 'About', href: '/about' },
];
