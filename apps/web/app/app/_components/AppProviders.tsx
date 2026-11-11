'use client';

import { NetworkProvider } from '../../../lib/near/network';
import { WalletProvider } from '../../../lib/near/wallet';

import type { ReactNode } from 'react';

export function AppProviders({ children }: { readonly children: ReactNode }) {
  return (
    <NetworkProvider>
      <WalletProvider>{children}</WalletProvider>
    </NetworkProvider>
  );
}
