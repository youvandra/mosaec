import {
  ArrowsLeftRightIcon,
  CalendarCheckIcon,
  HandCoinsIcon,
  LockKeyIcon,
  MapPinIcon,
  PathIcon,
} from '@phosphor-icons/react/dist/ssr';

import { AppIcon, Reveal, Section, SectionHeader, Tag, WordReveal } from '@mosaec/ui';

import styles from './HowItWorks.module.css';
import { AskVisual, ExitVisual, FillVisual, PackVisual, RedeemVisual } from './tour-visuals';
import { TourNav } from './TourNav';

import type { AppIconColor } from '@mosaec/ui';
import type { CSSProperties, ReactNode } from 'react';

interface Step {
  readonly id: string;
  readonly label: string;
  readonly color: AppIconColor;
  readonly icon: ReactNode;
  readonly visual: ReactNode;
  readonly lead: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    id: 'step-pack',
    label: 'Pack',
    color: 'ink',
    icon: <LockKeyIcon weight="fill" />,
    visual: <PackVisual />,
    lead: 'Seal your coins.',
    body: 'Move ZEC, BTC or SOL into a new pack: an account with zero access keys that runs one published contract. You receive its Title.',
  },
  {
    id: 'step-ask',
    label: 'Ask',
    color: 'blue',
    icon: <HandCoinsIcon weight="fill" />,
    visual: <AskVisual />,
    lead: 'Name the loan.',
    body: 'Set the USDC you want today, the repayment and the term. The pack holds still while the offer stands.',
  },
  {
    id: 'step-fill',
    label: 'Fill',
    color: 'violet',
    icon: <ArrowsLeftRightIcon weight="bold" />,
    visual: <FillVisual />,
    lead: 'A lender pays.',
    body: 'The House Desk fills a quoted offer within a minute, or any lender fills yours at your price: the lender sends USDC and takes the Title. The USDC and the Ticket reach you in the same receipt chain, and any mismatch refunds the lender in full.',
  },
  {
    id: 'step-redeem',
    label: 'Redeem',
    color: 'green',
    icon: <CalendarCheckIcon weight="fill" />,
    visual: <RedeemVisual />,
    lead: 'Buy your coins back.',
    body: 'Pay the repayment on any day before the date and the pack releases the coins to you.',
  },
  {
    id: 'step-exit',
    label: 'Exit',
    color: 'orange',
    icon: <MapPinIcon weight="fill" />,
    visual: <ExitVisual />,
    lead: 'Take them home.',
    body: 'The Title holder of a free pack withdraws to the home chain, ZEC to a Zcash address.',
  },
];

export function HowItWorks() {
  return (
    <Section id="how" label="How it works">
      <SectionHeader className={styles.header}>
        <Reveal>
          <Tag badge="3" shape={<PathIcon weight="bold" size={16} color="var(--ill-orange)" />}>
            How It Works
          </Tag>
        </Reveal>
        <WordReveal className="t-h1" lines={['One loan, five steps,', 'zero price checks.']} />
      </SectionHeader>
      <div className={styles.body}>
        <TourNav steps={STEPS.map(({ id, label }) => ({ id, label }))} />
        <div className={styles.cards}>
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              id={step.id}
              className={styles.card}
              style={{ '--i': index } as CSSProperties}
            >
              <div className={styles.cardHead}>
                <AppIcon color={step.color} size={44}>
                  {step.icon}
                </AppIcon>
                <h3 className="t-h3">{step.label}</h3>
              </div>
              <div className={styles.stage}>{step.visual}</div>
              <div className={styles.foot}>
                <strong className="t-h5">{step.lead}</strong>
                <p className="t-body">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
