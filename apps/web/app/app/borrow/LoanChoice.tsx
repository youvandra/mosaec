'use client';

import { LightningIcon, StorefrontIcon } from '@phosphor-icons/react';

import { cx } from '@mosaec/ui';

import { formatUnits, padCents } from '../../../lib/format';

import styles from './LoanChoice.module.css';

import type { QuoteState } from './useInstantQuote';
import type { ReactNode } from 'react';

export type LoanRoute = 'instant' | 'market';

const USDC_DECIMALS = 6;

function usdc(units: string): string {
  return `${padCents(formatUnits(BigInt(units), USDC_DECIMALS, 2))} USDC`;
}

function Option({
  value,
  route,
  onRoute,
  disabled,
  icon,
  title,
  tag,
  children,
}: {
  readonly value: LoanRoute;
  readonly route: LoanRoute;
  readonly onRoute: (route: LoanRoute) => void;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly title: string;
  readonly tag: string;
  readonly children: ReactNode;
}) {
  return (
    <label className={cx(styles.option, disabled === true && styles.disabled)}>
      <input
        type="radio"
        name="loan-route"
        value={value}
        className={styles.radio}
        checked={route === value}
        disabled={disabled}
        onChange={() => {
          onRoute(value);
        }}
      />
      <span className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.titles}>
          <span className={styles.title}>{title}</span>
          <span className={styles.tag}>{tag}</span>
        </span>
        <span className={styles.dot} aria-hidden="true" />
      </span>
      {children}
    </label>
  );
}

/**
 * Step 3 of Borrow: take the House Desk's live quote at once, or put your own terms on the open
 * market. A desk that cannot quote leaves only the market.
 */
export function LoanChoice({
  route,
  onRoute,
  quote,
  termLabel,
}: {
  readonly route: LoanRoute;
  readonly onRoute: (route: LoanRoute) => void;
  readonly quote: QuoteState;
  readonly termLabel: string;
}) {
  const ready = quote.status === 'ready';
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>How You Get the Loan</legend>
      <Option
        value="instant"
        route={route}
        onRoute={onRoute}
        disabled={!ready}
        icon={<LightningIcon size={16} weight="fill" />}
        title="Instant"
        tag="House Desk"
      >
        {quote.status === 'ready' ? (
          <>
            <dl className={styles.terms}>
              <div>
                <dt>Loan</dt>
                <dd>{usdc(quote.quote.principal)}</dd>
              </div>
              <div>
                <dt>Repay</dt>
                <dd>{usdc(quote.quote.repayment)}</dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>{(quote.quote.monthlyBps / 100).toFixed(2)}% a month</dd>
              </div>
              <div>
                <dt>Term</dt>
                <dd>{termLabel}</dd>
              </div>
            </dl>
            <span className={styles.note}>Open market can beat this price.</span>
          </>
        ) : (
          <span className={styles.note} aria-live="polite">
            {quote.status === 'unavailable'
              ? quote.reason
              : quote.status === 'loading'
                ? 'Reading the desk quote'
                : 'Seal coins to get a quote.'}
          </span>
        )}
      </Option>
      <Option
        value="market"
        route={route}
        onRoute={onRoute}
        icon={<StorefrontIcon size={16} weight="fill" />}
        title="Set Your Own Terms"
        tag="Open Market"
      >
        <span className={styles.note}>
          Your loan and repayment above, open to every lender for 3 days.
        </span>
      </Option>
    </fieldset>
  );
}
