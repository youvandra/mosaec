'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { parseOutcome } from '@mosaec/sdk';

import { track } from '../track';

import { useNetwork } from './network';
import { fetchTransaction, hashOf, toTransaction } from './transactions';

import type { SentTransaction } from './transactions';
import type { NetworkId } from '@mosaec/config/assets';
import type { ContractCall, RpcTxResult } from '@mosaec/sdk';
import type { ModuleState, WalletSelector } from '@near-wallet-selector/core';
import type { ReactNode } from 'react';

export interface WalletOption {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string;
  readonly available: boolean;
}

/** Result of a send: the outcomes, or `redirected` when a browser wallet left the page. */
export type SendResult =
  | { readonly kind: 'done'; readonly transactions: readonly SentTransaction[] }
  | { readonly kind: 'redirected' };

interface WalletState {
  readonly ready: boolean;
  readonly accountId: string | null;
  readonly walletName: string | null;
  readonly options: readonly WalletOption[];
  readonly connect: (walletId: string) => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly send: (calls: readonly ContractCall[]) => Promise<SendResult>;
}

const WalletContext = createContext<WalletState | null>(null);

/** Wallet modules load on demand, so pages without a wallet stay light. */
async function loadSelector(network: NetworkId): Promise<WalletSelector> {
  const [core, meteor, hot, myNear, intear] = await Promise.all([
    import('@near-wallet-selector/core'),
    import('@near-wallet-selector/meteor-wallet'),
    import('@near-wallet-selector/hot-wallet'),
    import('@near-wallet-selector/my-near-wallet'),
    import('@near-wallet-selector/intear-wallet'),
  ]);
  return core.setupWalletSelector({
    network,
    modules: [
      meteor.setupMeteorWallet(),
      hot.setupHotWallet(),
      myNear.setupMyNearWallet(),
      intear.setupIntearWallet(),
    ],
  });
}

function optionOf(module: ModuleState): WalletOption {
  return {
    id: module.id,
    name: module.metadata.name,
    iconUrl: module.metadata.iconUrl,
    available: module.metadata.available,
  };
}

/** Connects NEAR wallets through wallet-selector for the current network. */
export function WalletProvider({ children }: { readonly children: ReactNode }) {
  const { network } = useNetwork();
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [options, setOptions] = useState<readonly WalletOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void loadSelector(network).then((created) => {
      if (cancelled) return;
      setSelector(created);
      const sync = () => {
        const state = created.store.getState();
        const active = state.accounts.find((account) => account.active);
        setAccountId(active?.accountId ?? null);
        const selected = state.modules.find((m) => m.id === state.selectedWalletId);
        setWalletName(selected?.metadata.name ?? null);
        setOptions(state.modules.map(optionOf));
      };
      sync();
      const subscription = created.store.observable.subscribe(sync);
      unsubscribe = () => {
        subscription.unsubscribe();
      };
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [network]);

  const connect = useCallback(
    async (walletId: string) => {
      if (selector === null) return;
      const wallet = await selector.wallet(walletId);
      // No function-call key is requested: every Mosaec call needs a deposit or the wallet's own approval.
      await wallet.signIn({ accounts: [] });
      track('wallet_connected');
    },
    [selector],
  );

  const disconnect = useCallback(async () => {
    if (!selector?.isSignedIn()) return;
    await (await selector.wallet()).signOut();
  }, [selector]);

  const send = useCallback(
    async (calls: readonly ContractCall[]): Promise<SendResult> => {
      if (selector === null || accountId === null) {
        throw new Error('Connect a wallet first.');
      }
      const wallet = await selector.wallet();
      const results = await wallet.signAndSendTransactions({
        transactions: calls.map(toTransaction),
      });
      if (!Array.isArray(results)) {
        return { kind: 'redirected' };
      }
      const transactions = await Promise.all(
        results.map(async (result) => {
          const hash = hashOf(result);
          const raw = result as unknown as RpcTxResult;
          return 'receipts_outcome' in raw
            ? { hash, outcome: parseOutcome(raw), raw }
            : fetchTransaction(network, hash, accountId);
        }),
      );
      return { kind: 'done', transactions };
    },
    [selector, accountId, network],
  );

  const value = useMemo(
    () => ({
      ready: selector !== null,
      accountId,
      walletName,
      options,
      connect,
      disconnect,
      send,
    }),
    [selector, accountId, walletName, options, connect, disconnect, send],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (value === null) throw new Error('useWallet needs a WalletProvider');
  return value;
}
