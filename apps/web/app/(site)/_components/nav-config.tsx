import {
  BookOpenIcon,
  BracketsCurlyIcon,
  CalendarCheckIcon,
  GithubLogoIcon,
  HandCoinsIcon,
  PlugsConnectedIcon,
  RobotIcon,
  SealCheckIcon,
} from '@phosphor-icons/react/dist/ssr';

import { AppIcon } from '@mosaec/ui';

import { SITE } from '../../../lib/site';

import { DevAside } from './DevAside';

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
          title: 'Agents',
          caption: 'Pawn rules an agent can read and sign',
          href: '/agents',
          icon: (
            <AppIcon color="orange" size={TILE}>
              <RobotIcon weight="fill" />
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
  { label: 'Rates', href: '/rates' },
  { label: 'Safety', href: '/verify#rules' },
  {
    label: 'Developers',
    panel: {
      eyebrow: 'Developers',
      columns: 1,
      items: [
        {
          title: 'Overview',
          caption: 'Contracts, SDK and API in one page',
          href: '/developers',
          icon: (
            <AppIcon color="ink" size={TILE}>
              <BookOpenIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'SDK',
          caption: 'Typed call builders for every action',
          href: '/developers#sdk',
          icon: (
            <AppIcon color="violet" size={TILE}>
              <BracketsCurlyIcon weight="bold" />
            </AppIcon>
          ),
        },
        {
          title: 'API',
          caption: 'Packs, offers and positions as JSON',
          href: '/developers#api',
          icon: (
            <AppIcon color="teal" size={TILE}>
              <PlugsConnectedIcon weight="fill" />
            </AppIcon>
          ),
        },
        {
          title: 'Source',
          caption: 'MIT licensed on GitHub',
          href: SITE.sourceUrl,
          icon: (
            <AppIcon color="coral" size={TILE}>
              <GithubLogoIcon weight="fill" />
            </AppIcon>
          ),
        },
      ],
      aside: <DevAside />,
    },
  },
];
