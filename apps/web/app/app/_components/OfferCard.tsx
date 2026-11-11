import { ArrowRightIcon, EyeIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { StatusPill, cx } from '@mosaec/ui';

import { dealApr, dealInterest } from '../../../lib/deal';
import { formatUnits, padCents } from '../../../lib/format';
import { amountText, cashNumber, termText } from '../../../lib/pack-view';

import { CoinMark } from './CoinMark';
import { Countdown } from './Countdown';
import styles from './OfferCard.module.css';
import { packPath } from './routes';

import type { Deal } from '../../../lib/deal';

/** An open pawn as the object it is: sealed coins, the loan, the repayment and the date. */
export function OfferCard({
  packId,
  index,
  deal,
  offerEndsNs,
  example = false,
}: {
  readonly packId: string;
  readonly index: string;
  readonly deal: Deal;
  readonly offerEndsNs: string | null;
  readonly example?: boolean;
}) {
  const lead = deal.collateral[0];
  const apr = dealApr(deal);
  const interest = dealInterest(deal);
  const settle = deal.principal?.symbol ?? 'USDC';
  const body = (
    <>
      <div className={styles.head}>
        <CoinMark symbol={lead?.symbol ?? null} size={44} />
        <div className={styles.coins}>
          <span className={cx('t-h3', styles.amount)}>
            {lead === undefined ? 'Empty' : amountText(lead)}
          </span>
          <span className="t-caption">
            {example ? 'Example pawn' : `Pack #${index}`} · sealed, zero keys
          </span>
        </div>
        {example ? (
          <StatusPill tone="neutral" icon={EyeIcon}>
            Example
          </StatusPill>
        ) : (
          <StatusPill tone="accent">Open</StatusPill>
        )}
      </div>
      <div className={styles.flow}>
        <div className={styles.side}>
          <span className="t-caption">You lend</span>
          <span className={cx('t-h4', styles.num)}>
            {deal.principal === null ? '–' : cashNumber(deal.principal)}
          </span>
        </div>
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRightIcon size={16} weight="bold" />
        </span>
        <div className={cx(styles.side, styles.right)}>
          <span className="t-caption">You get back</span>
          <span className={cx('t-h4', styles.num)}>
            {deal.repayment === null ? '–' : cashNumber(deal.repayment)}
          </span>
        </div>
      </div>
      <ul className={styles.chips} aria-label="Terms">
        <li>{termText(deal.termNs)}</li>
        {apr !== null && <li>{apr.toFixed(1)}% APR</li>}
        {interest !== null && deal.principal?.decimals != null && (
          <li className={styles.earn}>
            +{padCents(formatUnits(interest, deal.principal.decimals, 2))} {settle}
          </li>
        )}
      </ul>
      <div className={styles.foot}>
        <span className="t-caption">
          {offerEndsNs === null ? (
            'Settles in USDC'
          ) : (
            <>
              Offer closes in <Countdown untilNs={offerEndsNs} compact />
            </>
          )}
        </span>
        <span className={styles.cta}>
          {example ? 'Preview' : 'Fill'}
          <ArrowRightIcon size={14} weight="bold" />
        </span>
      </div>
    </>
  );

  if (example) {
    return (
      <div className={cx(styles.card, styles.example)} aria-label="Example pawn">
        {body}
      </div>
    );
  }
  return (
    <Link href={packPath(packId)} className={styles.card} aria-label={`Pack #${index}`}>
      {body}
    </Link>
  );
}
