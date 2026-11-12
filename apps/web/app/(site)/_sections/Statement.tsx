'use client';

import { CalendarCheckIcon, LockKeyIcon, TicketIcon } from '@phosphor-icons/react';

import { AppIcon, Mark, cx, useInViewMotion } from '@mosaec/ui';

import styles from './Statement.module.css';

import type { CSSProperties, ReactNode } from 'react';

const ICON_SIZE = 60;

function tile(color: 'blue' | 'ink' | 'orange' | 'green', node: ReactNode, mark = false) {
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
  tile('blue', <Mark className={styles.brand} />),
  'keeps your coins in a sealed account,',
  tile('ink', <LockKeyIcon weight="fill" />),
  'hands you a Ticket',
  tile('orange', <TicketIcon weight="fill" />),
  'to buy them back, and watches one thing: the date.',
  tile('green', <CalendarCheckIcon weight="fill" />),
];

/** One sentence with inline tiles; each word rises in turn. */
export function Statement() {
  const ref = useInViewMotion<HTMLParagraphElement>(0.4);
  let index = 0;
  return (
    <section className={styles.section} aria-label="What Mosaec is">
      <p ref={ref} className={cx('t-statement', styles.text)}>
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
