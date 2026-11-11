import { CalendarCheckIcon, LockKeyIcon, TicketIcon } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';

import { AppIcon, cx } from '@mosaec/ui';

import { ASSET_MARK } from '../../../lib/asset-marks';

import styles from './Statement.module.css';

import type { CSSProperties, ReactNode } from 'react';

const ICON_SIZE = 60;

function tile(color: 'light' | 'ink' | 'orange' | 'green', node: ReactNode, mark = false) {
  return (
    <span className={styles.icon}>
      <AppIcon color={color} size={ICON_SIZE} mark={mark}>
        {node}
      </AppIcon>
    </span>
  );
}

const PIECES: readonly (string | ReactNode)[] = [
  'Mosaec',
  tile('light', <Image src={ASSET_MARK.ZEC} alt="" width={36} height={36} />, true),
  'keeps your coins in a sealed account,',
  tile('ink', <LockKeyIcon weight="fill" />),
  'hands you a Ticket',
  tile('orange', <TicketIcon weight="fill" />),
  'to buy them back, and watches one thing: the date.',
  tile('green', <CalendarCheckIcon weight="fill" />),
];

/** One sentence with inline tiles; each word rises in turn. */
export function Statement() {
  let index = 0;
  return (
    <section className={styles.section} aria-label="What Mosaec is">
      <p className={cx('t-statement', styles.text)} data-reveal="view">
        {PIECES.flatMap((piece, pieceIndex) => {
          if (typeof piece !== 'string') {
            const style = { '--i': index++ } as CSSProperties;
            return [
              <span key={`i${pieceIndex.toString()}`} className={styles.piece} style={style}>
                {piece}
              </span>,
            ];
          }
          return piece.split(' ').map((word, wordIndex) => {
            const style = { '--i': index++ } as CSSProperties;
            return (
              <span
                key={`${pieceIndex.toString()}-${wordIndex.toString()}`}
                className={styles.piece}
                style={style}
              >
                {`${word} `}
              </span>
            );
          });
        })}
      </p>
    </section>
  );
}
