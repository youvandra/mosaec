import {
  CubeIcon,
  FlagIcon,
  GlobeHemisphereWestIcon,
  InfoIcon,
  LockKeyIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  StampIcon,
  TicketIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { ButtonLink, Reveal, Section, Tag, WordReveal, cx } from '@mosaec/ui';

import { NEAR_MARK } from '../../../lib/asset-marks';
import { SITE } from '../../../lib/site';
import { CapabilityList, Eyebrow, Journey, SectionIntro } from '../_blocks';
import { Loss } from '../_sections/Loss';

import styles from './about.module.css';

import type { Capability, JourneyStep } from '../_blocks';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why Mosaec exists: price-triggered loans sell coins at the low. Mosaec is a pawn with a fixed repayment and a fixed date, built on NEAR.',
};

const SOLUTION: readonly Capability[] = [
  {
    title: 'A sealed pack',
    body: 'Your coins move into a NEAR account with zero keys. Only the repayment or the date can move them out.',
    icon: <CubeIcon weight="fill" />,
    color: 'blue',
  },
  {
    title: 'The Title',
    body: 'An NFT that owns the pack. The lender buys it, and with it the right to the coins if the date passes.',
    icon: <StampIcon weight="fill" />,
    color: 'ink',
  },
  {
    title: 'The Ticket',
    body: 'An NFT the borrower keeps. Pay the fixed amount before the date and the coins come back.',
    icon: <TicketIcon weight="fill" />,
    color: 'lime',
  },
  {
    title: 'No price trigger',
    body: 'Nothing reads a price. A drop in the middle of the term changes nothing for either side.',
    icon: <ShieldCheckIcon weight="fill" />,
    color: 'green',
  },
];

const WHY_NEAR: readonly Capability[] = [
  {
    title: 'Native coins',
    body: 'NEAR Intents holds real ZEC, BTC and SOL balances, so a pack seals the coin itself.',
    icon: <GlobeHemisphereWestIcon weight="fill" />,
    color: 'orange',
  },
  {
    title: 'Keyless accounts',
    body: 'A pack is a sub-account with no key at all, running one published contract.',
    icon: <LockKeyIcon weight="fill" />,
    color: 'violet',
  },
  {
    title: 'Checkable by anyone',
    body: 'Every rule and every pack reads straight from the chain, from any browser.',
    icon: <SealCheckIcon weight="fill" />,
    color: 'teal',
  },
];

const ROADMAP: readonly JourneyStep[] = [
  {
    stamp: 'Now',
    title: 'Live on NEAR testnet',
    body: 'Borrow, lend, verify and the house desk run against the testnet registry.',
    icon: <RocketLaunchIcon weight="fill" />,
    color: 'blue',
  },
  {
    stamp: 'Next',
    title: 'Independent review',
    body: 'An outside review of the pack and registry contracts before any real funds.',
    icon: <ShieldCheckIcon weight="fill" />,
    color: 'green',
  },
  {
    stamp: 'Then',
    title: 'Mainnet with ZEC first',
    body: 'Small caps per pack, raised only as the record grows.',
    icon: <FlagIcon weight="fill" />,
    color: 'orange',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className={styles.hero} aria-label="About">
        <span className={styles.glow} aria-hidden="true" />
        <Reveal trigger="load">
          <Tag badge="Mosaec" shape={<InfoIcon weight="fill" size={16} color="var(--ill-lime)" />}>
            About
          </Tag>
        </Reveal>
        <WordReveal
          as="h1"
          trigger="load"
          className={cx('t-display', styles.title)}
          lines={['Credit for coins,', { text: 'without a price trigger.', className: 't-accent' }]}
        />
        <Reveal as="p" trigger="load" delay={0.4} className={cx('t-body-lg', styles.lead)}>
          Crypto loans sell your coins the moment a price dips. Mosaec is a pawn instead: a fixed
          repayment, a fixed date, and nothing in between.
        </Reveal>
        <Reveal trigger="load" delay={0.55} className={styles.actions}>
          <ButtonLink href={SITE.appUrl} as={Link}>
            Open App
          </ButtonLink>
          <ButtonLink href={SITE.sourceUrl} variant="secondary" showIcon>
            Read the Code
          </ButtonLink>
        </Reveal>
      </section>

      <Loss badge="1" />

      <Section id="solution" label="The answer">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="2"
              shape={<StampIcon weight="fill" size={16} color="var(--ill-orange)" />}
              label="The Answer"
            />
          }
          title={['An old idea,', 'made exact.']}
          lead="A pawn shop never sells your watch because the market moved. Mosaec keeps that promise in code."
        />
        <CapabilityList items={SOLUTION} />
      </Section>

      <Section id="near" label="Why NEAR">
        <SectionIntro
          layout="split"
          eyebrow={
            <Eyebrow
              badge="3"
              shape={<Image src={NEAR_MARK.src} alt="" width={18} height={18} />}
              label="Why NEAR"
            />
          }
          title={['Built where coins', 'stay native.']}
        />
        <CapabilityList items={WHY_NEAR} />
      </Section>

      <Section id="roadmap" label="Roadmap">
        <SectionIntro
          layout="center"
          eyebrow={
            <Eyebrow
              badge="4"
              shape={<RocketLaunchIcon weight="fill" size={16} color="var(--ill-violet)" />}
              label="Roadmap"
            />
          }
          title={['Where it stands', 'today.']}
        />
        <Journey steps={ROADMAP} />
      </Section>
    </>
  );
}
