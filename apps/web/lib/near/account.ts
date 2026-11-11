import { NETWORKS } from '@mosaec/config/networks';

import type { NetworkId } from '@mosaec/config/assets';

/** NEAR account id rules: 2 to 64 chars, lowercase parts split by `.`, `-` or `_` inside parts. */
const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
/** Implicit accounts: 64 hex chars, or an 0x address for eth-implicit ones. */
const IMPLICIT = /^([a-f\d]{64}|0x[a-f\d]{40})$/;

export function isAccountId(value: string): boolean {
  return ACCOUNT_ID.test(value) || IMPLICIT.test(value);
}

/**
 * Whether the account exists on chain: `missing` only when the RPC says so, `unknown` when it could
 * not answer. Implicit accounts count as existing: they come alive on their first transfer.
 */
export async function accountState(
  network: NetworkId,
  accountId: string,
): Promise<'exists' | 'missing' | 'unknown'> {
  if (IMPLICIT.test(accountId)) return 'exists';
  try {
    const response = await fetch(NETWORKS[network].rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'mosaec',
        method: 'query',
        params: { request_type: 'view_account', finality: 'final', account_id: accountId },
      }),
    });
    if (!response.ok) return 'unknown';
    const body = (await response.json()) as {
      result?: unknown;
      error?: { cause?: { name?: string } };
    };
    if (body.result !== undefined) return 'exists';
    return body.error?.cause?.name === 'UNKNOWN_ACCOUNT' ? 'missing' : 'unknown';
  } catch {
    return 'unknown';
  }
}
