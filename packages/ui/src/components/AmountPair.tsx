import styles from './AmountPair.module.css';
import { cx } from './cx';

import type { ReactNode } from 'react';

export interface AmountSide {
  readonly label: string;
  readonly amount: string;
  readonly symbol: string;
  /** Token mark image URL. */
  readonly mark: string;
}

export interface AmountPairProps {
  readonly from: AmountSide;
  readonly to: AmountSide;
  readonly note?: ReactNode;
}

function Side({ side }: { readonly side: AmountSide }) {
  return (
    <div className={styles.side}>
      <div className={styles.figures}>
        <span className="t-caption">{side.label}</span>
        <span className={styles.amount}>{side.amount}</span>
      </div>
      <span className={styles.chip}>
        <img src={side.mark} alt="" width={22} height={22} />
        {side.symbol}
      </span>
    </div>
  );
}

/** Two stacked amounts, what goes in and what comes out. */
export function AmountPair({ from, to, note }: AmountPairProps) {
  return (
    <div className={styles.pair}>
      <Side side={from} />
      <Side side={to} />
      {note !== undefined && <div className={cx('t-caption', styles.note)}>{note}</div>}
    </div>
  );
}
