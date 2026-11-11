'use client';

import { CheckIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useState } from 'react';

import { ButtonLink, Reveal, Segmented, StatusPill, cx } from '@mosaec/ui';

import styles from './rates.module.css';

export interface PlanTerm {
  readonly days: number;
  readonly repayment: string;
  readonly dot: string;
  readonly featured: boolean;
  readonly blurb: string;
  readonly checks: readonly string[];
}

export interface AssetPlans {
  readonly symbol: string;
  readonly terms: readonly PlanTerm[];
}

/** Asset switch plus one card per term (Pricing > Plans). */
export function RatePlans({
  assets,
  principal,
  href,
}: {
  readonly assets: readonly AssetPlans[];
  readonly principal: string;
  readonly href: string;
}) {
  const [symbol, setSymbol] = useState(assets[0]?.symbol ?? '');
  const current = assets.find((asset) => asset.symbol === symbol) ?? assets[0];
  return (
    <>
      <div className={styles.toggle}>
        <Segmented
          label="Collateral asset"
          tone="ink"
          value={symbol}
          onChange={setSymbol}
          options={assets.map((asset) => ({ id: asset.symbol, label: asset.symbol }))}
        />
        <span className={styles.ltvChip}>At 50% LTV</span>
      </div>
      <div key={symbol} className={styles.plans}>
        {current?.terms.map((term, index) => (
          <Reveal
            key={term.days}
            delay={0.1 + index * 0.08}
            className={cx(styles.plan, term.featured && styles.planDark)}
          >
            <div className={styles.planHead}>
              <span className={styles.planName}>
                <span className={styles.planDot} style={{ background: term.dot }} />
                {term.days} days
              </span>
              {term.featured && (
                <StatusPill tone="neutral" dot={false} className={styles.lime}>
                  Suggested Default
                </StatusPill>
              )}
            </div>
            <div className={styles.price}>
              <span className={styles.priceValue}>{term.repayment}</span>
              <span className={styles.priceUnit}>USDC due</span>
            </div>
            <span className={cx('t-caption', styles.planSub)}>
              On {principal} USDC borrowed against {current.symbol}
            </span>
            <p className={cx('t-body-sm', styles.blurb)}>{term.blurb}</p>
            <ButtonLink
              href={href}
              as={Link}
              variant={term.featured ? 'inverse' : 'secondary'}
              fullWidth
              showIcon
            >
              {`Borrow for ${term.days.toString()} Days`}
            </ButtonLink>
            <ul className={styles.planChecks}>
              {term.checks.map((check) => (
                <li key={check}>
                  <CheckIcon weight="bold" size={14} />
                  {check}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </>
  );
}
