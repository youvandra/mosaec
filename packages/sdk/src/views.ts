import { ASSETS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import {
  MosaecError,
  packStatusSchema,
  parseContractJson,
  positionViewSchema,
  registryConfigSchema,
} from '@mosaec/domain';

import { ftAccountOf } from './actions';

import type { RpcTxResult } from './outcome';
import type { NetworkId } from '@mosaec/config/assets';
import type { PackStatus, PositionView, RegistryConfig } from '@mosaec/domain';
import type { z } from 'zod';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface RpcEnvelope {
  readonly result?: unknown;
  readonly error?: { readonly cause?: { readonly name?: string }; readonly message?: string };
}

/** Minimal NEAR JSON-RPC transport. Every response is parsed with bigint-safe JSON. */
export class NearRpc {
  /** Browsers throw "Illegal invocation" when `fetch` is called as a method of another object. */
  constructor(
    private readonly url: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async request(method: string, params: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'mosaec', method, params }),
      });
    } catch (cause) {
      throw new MosaecError('UPSTREAM_RPC', { cause });
    }
    if (!response.ok) {
      throw new MosaecError('UPSTREAM_RPC', {
        cause: new Error(`HTTP ${response.status.toString()}`),
      });
    }
    const body = parseContractJson(await response.text()) as RpcEnvelope;
    if (body.error !== undefined) {
      throw new MosaecError('UPSTREAM_RPC', {
        cause: new Error(body.error.message ?? 'RPC error'),
      });
    }
    return body.result;
  }

  /** Calls a view method and returns its decoded JSON result. */
  async view(accountId: string, method: string, args: unknown = {}): Promise<unknown> {
    const result = (await this.request('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: accountId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    })) as { result: number[] };
    return parseContractJson(new TextDecoder().decode(Uint8Array.from(result.result)));
  }

  /** A finished transaction, waiting until it is final. */
  async tx(txHash: string, senderId: string): Promise<RpcTxResult> {
    return (await this.request('tx', {
      tx_hash: txHash,
      sender_account_id: senderId,
      wait_until: 'FINAL',
    })) as RpcTxResult;
  }
}

function parsed<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new MosaecError('UPSTREAM_RPC', { cause: result.error });
  }
  return result.data;
}

/** Typed reads of the registry, packs and verifier on one network. */
export class MosaecViews {
  readonly registry: string;
  readonly verifier: string;

  constructor(
    private readonly network: NetworkId,
    private readonly rpc: NearRpc = new NearRpc(NETWORKS[network].rpcUrl),
  ) {
    this.registry = NETWORKS[network].registryAccountId;
    this.verifier = NETWORKS[network].verifierAccountId;
  }

  async config(): Promise<RegistryConfig> {
    return parsed(registryConfigSchema, await this.rpc.view(this.registry, 'config'));
  }

  /** The position of `pack`, or `undefined` when the registry has no such pack. */
  async positionOf(pack: string): Promise<PositionView | undefined> {
    const value = await this.rpc.view(this.registry, 'position_of', { pack });
    return value === null ? undefined : parsed(positionViewSchema, value);
  }

  async packStatus(pack: string): Promise<PackStatus> {
    return parsed(packStatusSchema, await this.rpc.view(pack, 'status'));
  }

  /** Wallet balance of `accountId` in the NEP-141 contract behind `tokenId`. */
  async walletBalanceOf(accountId: string, tokenId: string): Promise<bigint> {
    const value = await this.rpc.view(ftAccountOf(tokenId), 'ft_balance_of', {
      account_id: accountId,
    });
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new MosaecError('UPSTREAM_RPC', { cause: new Error('unexpected balance') });
    }
    return BigInt(value);
  }

  /** Whether `accountId` is registered on the token contract behind `tokenId`. */
  async isRegistered(accountId: string, tokenId: string): Promise<boolean> {
    const value = await this.rpc.view(ftAccountOf(tokenId), 'storage_balance_of', {
      account_id: accountId,
    });
    return value !== null;
  }

  /** Native NEAR balance of `accountId` in yoctoNEAR. */
  async nearBalanceOf(accountId: string): Promise<bigint> {
    const view = (await this.rpc.request('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId,
    })) as { amount?: unknown };
    if (typeof view.amount !== 'string' || !/^\d+$/.test(view.amount)) {
      throw new MosaecError('UPSTREAM_RPC', { cause: new Error('unexpected account view') });
    }
    return BigInt(view.amount);
  }

  /** Verifier balance of `accountId` in `tokenId`, in the token's smallest unit. */
  async balanceOf(accountId: string, tokenId: string): Promise<bigint> {
    const value = await this.rpc.view(this.verifier, 'mt_balance_of', {
      account_id: accountId,
      token_id: tokenId,
    });
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new MosaecError('UPSTREAM_RPC', { cause: new Error('unexpected balance') });
    }
    return BigInt(value);
  }

  /**
   * Verifier balances `account` holds in the network's allowlisted tokens, non-zero lines only.
   * A free pack records no contents on chain, so this is how much it holds.
   */
  async holdingsOf(account: string): Promise<{ token_id: string; amount: bigint }[]> {
    const tokenIds = NETWORKS[this.network].assets.map(
      (symbol) => ASSETS[symbol].tokenIds[this.network],
    );
    const values = await this.rpc.view(this.verifier, 'mt_batch_balance_of', {
      account_id: account,
      token_ids: tokenIds,
    });
    if (
      !Array.isArray(values) ||
      values.length !== tokenIds.length ||
      !values.every((v) => typeof v === 'string' && /^\d+$/.test(v))
    ) {
      throw new MosaecError('UPSTREAM_RPC', { cause: new Error('unexpected batch balance') });
    }
    return tokenIds.flatMap((token_id, i) => {
      const amount = BigInt(values[i] as string);
      return amount > 0n ? [{ token_id, amount }] : [];
    });
  }
}
