'use client';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';

import { useNetwork } from '../../../lib/near/network';

import styles from './NetworkToggle.module.css';

const LABEL = { mainnet: 'Mainnet', testnet: 'Testnet' } as const;

/** Network switch. A network that is still disabled keeps its place and stays greyed. */
export function NetworkToggle() {
  const { network, select } = useNetwork();
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="Network">
      {NETWORK_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={network === id}
          disabled={!NETWORKS[id].enabled}
          className={styles.option}
          onClick={() => {
            select(id);
          }}
        >
          {LABEL[id]}
        </button>
      ))}
    </div>
  );
}
