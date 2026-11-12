import { LightningIcon, TrendDownIcon } from '@phosphor-icons/react/dist/ssr';

import { AppIcon, Reveal, Section, Tag, WordReveal, cx } from '@mosaec/ui';

import { LIQUIDATION_REPLAY as L, ROLLING_REPLAY as R } from '../_content/facts';

import styles from './Loss.module.css';

import type { CSSProperties } from 'react';

const ROWS = [
  { label: 'Venue', value: `${L.venue}, ZEC market` },
  { label: 'Window', value: L.window },
  { label: 'Liquidations', value: `${L.events} across ${L.accounts} accounts` },
  { label: 'Higher 90 days later', value: L.higherAt90d, fill: L.higherAt90d },
  { label: `Worth on ${L.measuredOn}`, value: `${L.valueToday}, sold for ${L.saleValue}` },
] as const;

export function Loss({ badge = '1' }: { readonly badge?: string }) {
  return (
    <Section id="loss" label="The loss, measured">
      <div className={styles.grid}>
        <Reveal className={styles.panel}>
          <span className={styles.glow} aria-hidden="true" />
          <span className={styles.bigIcon} aria-hidden="true">
            <AppIcon color="blue" size={168}>
              <LightningIcon weight="regular" />
            </AppIcon>
          </span>
          <dl className={styles.console}>
            {ROWS.map((row) => (
              <div
                key={row.label}
                className={cx(styles.row, 'fill' in row ? styles.bar : '')}
                style={'fill' in row ? ({ '--fill': row.fill } as CSSProperties) : undefined}
              >
                <dt className="t-mono">{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <div className={styles.copy}>
          <Reveal>
            <Tag
              badge={badge}
              shape={<TrendDownIcon weight="bold" size={16} color="var(--ill-mint)" />}
            >
              The Loss
            </Tag>
          </Reveal>
          <WordReveal
            className="t-h1"
            lines={['A liquidation dumps', 'your coins at the bottom.']}
          />
          <Reveal as="p" className="t-body-lg">
            A price-triggered loan closes at the worst hour and sells your coins to settle it. On{' '}
            {L.venue}, {L.accounts} accounts lost {L.seizedZec} ZEC this way in a year, and most of
            those coins recovered within three months.
          </Reveal>
          <Reveal className={styles.stats}>
            <div className={styles.stat}>
              <span className="t-h2">{R.liquidated}</span>
              <span className="t-body-sm">
                of {R.termDays}-day ZEC loans at {R.ltv} LTV hit liquidation
              </span>
            </div>
            <div className={styles.stat}>
              <span className="t-h2">{R.pawnForfeit}</span>
              <span className="t-body-sm">
                ended below the repayment, the pawn&apos;s only loss
              </span>
            </div>
          </Reveal>
          <Reveal as="p" className={cx('t-caption', styles.source)}>
            Every 90-day start date from {R.span}, hourly prices; Rhea events to {L.measuredOn}.
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
