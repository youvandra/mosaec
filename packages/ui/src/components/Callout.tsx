import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react/dist/ssr';

import styles from './Callout.module.css';
import { cx } from './cx';

import type { ReactNode } from 'react';

export type CalloutTone = 'info' | 'warning' | 'danger' | 'positive';

const ICONS: Readonly<Record<CalloutTone, ReactNode>> = {
  info: <InfoIcon size={18} weight="fill" />,
  warning: <WarningIcon size={18} weight="fill" />,
  danger: <WarningCircleIcon size={18} weight="fill" />,
  positive: <CheckCircleIcon size={18} weight="fill" />,
};

export interface CalloutProps {
  readonly tone?: CalloutTone;
  readonly title?: string;
  readonly children: ReactNode;
  /** Optional control on the right, such as a button. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/** An inline notice inside a card or page: tinted, with an icon, an optional title and action. */
export function Callout({ tone = 'info', title, children, action, className }: CalloutProps) {
  return (
    <div
      className={cx(styles.callout, styles[tone], className)}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <span className={styles.icon}>{ICONS[tone]}</span>
      <div className={styles.text}>
        {title !== undefined && <p className={styles.title}>{title}</p>}
        <div className={styles.body}>{children}</div>
      </div>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}
