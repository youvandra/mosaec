import {
  CalendarCheckIcon,
  ChartBarIcon,
  HandCoinsIcon,
  PlugsConnectedIcon,
  RobotIcon,
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
          caption: 'USDC for your coins, zero liquidation',
          href: '/borrow',
          icon: (
            <AppIcon color="blue" size={TILE}>
              <HandCoinsIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Lend',
          caption: 'Fixed return, coins as backstop',
          href: '/lend',
          icon: (
            <AppIcon color="lime" size={TILE}>
              <CalendarCheckIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Rates',
          caption: 'Suggested rates per coin and term',
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
      footer: {
        badge: 'New',
        text: 'ZEC, BTC and SOL packs are live on NEAR testnet.',
        href: SITE.appUrl,
      },
    },
  },
  { label: 'Market', href: '/market' },
  {
    label: 'Agents',
    panel: {
      eyebrow: 'Agents',
      items: [
        {
          title: 'House Desk',
          caption: 'USDC in a minute, priced by its agent',
          href: '/agents',
          icon: (
            <AppIcon color="violet" size={TILE}>
              <RobotIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Your Agent',
          caption: 'Lend your USDC inside your rules',
          href: '/agents/connect',
          icon: (
            <AppIcon color="ink" size={TILE}>
              <PlugsConnectedIcon weight="fill" />
            </AppIcon>
          ),
        },
      ],
    },
  },
  { label: 'Docs', href: '/docs' },
  { label: 'About', href: '/about' },
];
