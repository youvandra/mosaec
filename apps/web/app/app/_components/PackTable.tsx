import Image from 'next/image';
import Link from 'next/link';

import { AppIcon, StatusPill } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';
import { amountText, aprText, contentsText, leadSymbol, termText } from '../../../lib/pack-view';
import { STATUS_TONE } from '../../../lib/status';

import styles from './PackTable.module.css';
import { packPath } from './routes';

import type { Pack } from '../../../lib/api';
import type { AssetSymbol } from '@mosaec/config/assets';

function Mark({ pack }: { readonly pack: Pack }) {
  const symbol = leadSymbol(pack);
  const src =
    symbol !== null && symbol in ASSET_MARK ? ASSET_MARK[symbol as AssetSymbol] : ASSET_MARK.ZEC;
  return (
    <AppIcon color="light" size={36} mark>
      <Image src={src} alt="" width={22} height={22} />
    </AppIcon>
  );
}

function Status({ pack }: { readonly pack: Pack }) {
  return pack.status === null ? (
    <StatusPill tone="neutral">Free</StatusPill>
  ) : (
    <StatusPill tone={STATUS_TONE[pack.status]}>{pack.status}</StatusPill>
  );
}

function asks(pack: Pack): string {
  return pack.offer === null ? 'n/a' : amountText(pack.offer.price, 2);
}

function repays(pack: Pack): string {
  return pack.terms === null ? 'n/a' : amountText(pack.terms.repayment, 2);
}

/** Packs as a table on wide screens and as cards on phones. */
export function PackTable({
  packs,
  caption,
}: {
  readonly packs: readonly Pack[];
  readonly caption: string;
}) {
  return (
    <>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Pack</th>
              <th scope="col">Collateral</th>
              <th scope="col" className={styles.num}>
                Loan
              </th>
              <th scope="col" className={styles.num}>
                Repayment
              </th>
              <th scope="col">Term</th>
              <th scope="col" className={styles.num}>
                APR
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => (
              <tr key={pack.id} className={styles.row}>
                <td>
                  <Link href={packPath(pack.id)} className={styles.link}>
                    <span className={styles.pack}>
                      <Mark pack={pack} />
                      Pack #{pack.index}
                    </span>
                  </Link>
                </td>
                <td>{contentsText(pack)}</td>
                <td className={styles.num}>{asks(pack)}</td>
                <td className={styles.num}>{repays(pack)}</td>
                <td>{termText(pack.terms?.termNs ?? null)}</td>
                <td className={styles.num}>{aprText(pack) ?? 'n/a'}</td>
                <td>
                  <Status pack={pack} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.cards} aria-label={caption}>
        {packs.map((pack) => (
          <li key={pack.id}>
            <Link href={packPath(pack.id)} className={styles.card}>
              <span className={styles.cardHead}>
                <span className={styles.pack}>
                  <Mark pack={pack} />
                  Pack #{pack.index}
                </span>
                <Status pack={pack} />
              </span>
              <dl className={styles.cardFacts}>
                <dt>Collateral</dt>
                <dd>{contentsText(pack)}</dd>
                <dt>Loan</dt>
                <dd>{asks(pack)}</dd>
                <dt>Repayment</dt>
                <dd>{repays(pack)}</dd>
                <dt>Term</dt>
                <dd>{termText(pack.terms?.termNs ?? null)}</dd>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
