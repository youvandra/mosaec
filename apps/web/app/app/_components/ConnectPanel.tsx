import { AppIcon } from '@mosaec/ui';

import styles from './ConnectPanel.module.css';
import { WalletButton } from './WalletButton';

import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

export interface ConnectItem {
  readonly icon: ReactNode;
  readonly color: AppIconColor;
  readonly title: string;
  readonly body: string;
}

/**
 * What a wallet page shows before a wallet is connected: the ask on the left, what the page will
 * hold on the right, in the grey tray with white cards.
 */
export function ConnectPanel({
  icon,
  title,
  body,
  items,
  footer,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly items: readonly ConnectItem[];
  /** Extra line under the button, such as the coins the page covers. */
  readonly footer?: ReactNode;
}) {
  return (
    <div className={styles.connect}>
      <div className={styles.copy}>
        <AppIcon color="ink" size={48}>
          {icon}
        </AppIcon>
        <h2 className="t-h3">{title}</h2>
        <p className="t-body">{body}</p>
        <div className={styles.action}>
          <WalletButton size="md" />
        </div>
        {footer}
      </div>
      <ul className={styles.legend}>
        {items.map((item) => (
          <li key={item.title} className={styles.item}>
            <AppIcon color={item.color} size={36}>
              {item.icon}
            </AppIcon>
            <span className={styles.stack}>
              <span className="t-label">{item.title}</span>
              <span className="t-caption">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
