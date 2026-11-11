'use client';

import Image from 'next/image';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';

import { NEAR_MARK } from '../../../lib/asset-marks';
import { useNetwork } from '../../../lib/near/network';

import styles from './NetworkToggle.module.css';

const LABEL = { mainnet: 'Mainnet', testnet: 'Testnet' } as const;

/** Network switch. A network that is still disabled keeps its place and stays greyed. */
export function NetworkToggle() {
  const { network, select } = useNetwork();
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="NEAR network">
      <Image className={styles.mark} src={NEAR_MARK.src} alt="NEAR" width={22} height={22} />
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
