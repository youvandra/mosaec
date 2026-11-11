import { actionCreators } from '@near-js/transactions';

import { NETWORKS } from '@mosaec/config/networks';
import { NearRpc, parseOutcome } from '@mosaec/sdk';

import type { NetworkId } from '@mosaec/config/assets';
import type { ContractCall, Outcome, RpcTxResult } from '@mosaec/sdk';

/** A wallet-selector transaction for one contract call; args go as the exact JSON bytes. */
export function toTransaction(call: ContractCall) {
  return {
    receiverId: call.receiverId,
    actions: [
      actionCreators.functionCall(
        call.methodName,
        new TextEncoder().encode(call.args),
        call.gas,
        call.deposit,
      ),
    ],
  };
}

export interface SentTransaction {
  readonly hash: string;
  readonly outcome: Outcome;
  readonly raw: RpcTxResult;
}

interface WithHash {
  readonly transaction?: { readonly hash?: string };
  readonly transaction_outcome?: { readonly id?: string };
}

/** Reads the hash out of a wallet's final execution outcome. */
export function hashOf(result: unknown): string {
  const value = result as WithHash;
  return value.transaction?.hash ?? value.transaction_outcome?.id ?? '';
}

/** Fetches a finished transaction from RPC, for wallets that redirect instead of returning it. */
export async function fetchTransaction(
  network: NetworkId,
  hash: string,
  signerId: string,
): Promise<SentTransaction> {
  const raw = await new NearRpc(NETWORKS[network].rpcUrl).tx(hash, signerId);
  return { hash, outcome: parseOutcome(raw), raw };
}
