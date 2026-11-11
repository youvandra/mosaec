'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { DEFAULT_NETWORK, NETWORKS } from '@mosaec/config/networks';

import type { NetworkId } from '@mosaec/config/assets';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'mosaec.network';

interface NetworkState {
  readonly network: NetworkId;
  readonly select: (network: NetworkId) => void;
}

const NetworkContext = createContext<NetworkState | null>(null);

function stored(): NetworkId {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const id = NETWORK_IDS.find((candidate) => candidate === value);
    return id !== undefined && NETWORKS[id].enabled ? id : DEFAULT_NETWORK;
  } catch {
    return DEFAULT_NETWORK;
  }
}

/** The network the app reads and signs on. Only enabled networks can be selected. */
export function NetworkProvider({ children }: { readonly children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkId>(() =>
    typeof window === 'undefined' ? DEFAULT_NETWORK : stored(),
  );

  const select = useCallback((next: NetworkId) => {
    if (!NETWORKS[next].enabled) return;
    setNetwork(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }, []);

  const value = useMemo(() => ({ network, select }), [network, select]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  const value = useContext(NetworkContext);
  if (value === null) throw new Error('useNetwork needs a NetworkProvider');
  return value;
}
