import { cx } from './cx';
import styles from './NftCard.module.css';

import type { CSSProperties, ReactNode } from 'react';

export interface NftCardProps {
  readonly kind: 'title' | 'ticket';
  /** Short id such as `#12`. */
  readonly tokenLabel: string;
  /** Main line, such as the contents or the strike. */
  readonly value: string;
  /** Secondary line, such as the holder or the date. */
  readonly meta?: string;
  readonly icon?: ReactNode;
  readonly tone?: 'default' | 'lime';
  /** Colour behind the ticket notches; match the surface the card sits on. */
  readonly notch?: string;
  readonly className?: string | undefined;
  readonly style?: CSSProperties;
}

const KIND_LABEL = { title: 'Title', ticket: 'Ticket' } as const;

/** Card-shaped face for a Title or Ticket NFT. */
export function NftCard({
  kind,
  tokenLabel,
  value,
  meta,
  icon,
  tone = 'default',
  notch,
  className,
  style,
}: NftCardProps) {
  const notchStyle = notch === undefined ? {} : ({ '--notch': notch } as CSSProperties);
  return (
    <div
      className={cx(styles.card, styles[kind], tone === 'lime' && styles.lime, className)}
      style={{ ...notchStyle, ...style }}
    >
      <div className={styles.top}>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        <span className={styles.meta}>{tokenLabel}</span>
      </div>
      <div className={styles.bottom}>
        <div>
          <div className={styles.value}>{value}</div>
          {meta !== undefined && <div className={styles.meta}>{meta}</div>}
        </div>
        {icon}
      </div>
    </div>
  );
}
