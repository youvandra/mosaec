import { TrendDownIcon, TrendUpIcon } from '@phosphor-icons/react';

import { cx } from '@mosaec/ui';

import { usdText } from '../../../lib/prices';

import styles from './ValueCheck.module.css';

/**
 * Coins worth now against the repayment, from the side that matters: a borrower asks whether
 * redeeming pays off, a lender how far the coins cover the loan. Prices are references only.
 */
export function ValueCheck({
  side,
  worth,
  owed,
}: {
  readonly side: 'borrower' | 'lender';
  readonly worth: number;
  readonly owed: number;
}) {
  const ahead = worth >= owed;
  const cover = owed === 0 ? 0 : worth / owed;
  const verdict =
    side === 'borrower'
      ? ahead
        ? 'Worth redeeming'
        : 'Coins worth less than the repayment'
      : `Coins cover ${cover.toFixed(2)}× the repayment`;
  return (
    <div className={cx(styles.box, ahead ? styles.ahead : styles.behind)}>
      <div className={styles.row}>
        <span title="CoinGecko reference price">Coins now</span>
        <strong>{usdText(worth)}</strong>
      </div>
      <div className={styles.row}>
        <span>{side === 'borrower' ? 'You repay' : 'Repaid to you'}</span>
        <strong>{usdText(owed)}</strong>
      </div>
      <span className={styles.verdict}>
        {ahead ? (
          <TrendUpIcon size={14} weight="bold" />
        ) : (
          <TrendDownIcon size={14} weight="bold" />
        )}
        {verdict}
      </span>
    </div>
  );
}
