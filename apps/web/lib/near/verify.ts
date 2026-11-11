import { NETWORKS } from '@mosaec/config/networks';
import { MosaecViews, NearRpc } from '@mosaec/sdk';

import { CODE_HASHES } from '../deployments';

import type { NetworkId } from '@mosaec/config/assets';

export type CheckResult = 'pass' | 'fail' | 'skip';

export interface Check {
  readonly id: string;
  readonly label: string;
  readonly result: CheckResult;
  readonly detail: string;
}

interface AccountView {
  readonly code_hash: string;
  readonly global_contract_hash?: string | null;
}

interface KeyList {
  readonly keys: readonly unknown[];
}

function check(id: string, label: string, pass: boolean, detail: string): Check {
  return { id, label, result: pass ? 'pass' : 'fail', detail };
}

/**
 * Every check runs in the browser against public RPC: the pack account, the verifier and the
 * registry. Nothing comes from the Mosaec API.
 */
export async function verifyPack(network: NetworkId, packId: string): Promise<readonly Check[]> {
  const config = NETWORKS[network];
  const rpc = new NearRpc(config.rpcUrl);
  const views = new MosaecViews(network, rpc);
  const published = CODE_HASHES[network]?.pack ?? null;

  const [account, keys, predecessorAuth, locked, position] = await Promise.all([
    rpc.request('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: packId,
    }) as Promise<AccountView>,
    rpc.request('query', {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: packId,
    }) as Promise<KeyList>,
    rpc.view(config.verifierAccountId, 'is_auth_by_predecessor_id_enabled', { account_id: packId }),
    rpc.view(config.verifierAccountId, 'is_account_locked', { account_id: packId }),
    views.positionOf(packId),
  ]);

  const codeHash = account.global_contract_hash ?? account.code_hash;
  const checks: Check[] = [
    check(
      'registry',
      'Created by the Mosaec registry',
      position !== undefined,
      position === undefined
        ? `${config.registryAccountId} has no record of this account.`
        : `Recorded by ${config.registryAccountId} as pack #${position.position.index.toString()}.`,
    ),
    check(
      'keys',
      'Zero access keys',
      keys.keys.length === 0,
      `${keys.keys.length.toString()} keys on the account.`,
    ),
    check(
      'code',
      'Runs the published pack code',
      published !== null && codeHash === published,
      `Code hash ${codeHash}.`,
    ),
    check(
      'auth',
      'Predecessor authentication on',
      predecessorAuth === true,
      'The verifier accepts moves only from the pack contract itself.',
    ),
    check(
      'lock',
      'Unlocked at the verifier',
      locked === false,
      locked === false
        ? 'The verifier has no lock on this account.'
        : 'The verifier has locked this account.',
    ),
  ];

  if (position?.position.stage.state === 'written') {
    const committed = position.position.stage.encumbrance.contents;
    const balances = await Promise.all(
      committed.map((line) => views.balanceOf(packId, line.token_id)),
    );
    const matches = committed.every((line, index) => (balances[index] ?? 0n) >= line.amount);
    checks.push(
      check(
        'balances',
        'Holds the committed contents',
        matches,
        matches ? 'Every committed balance is in the pack.' : 'A committed balance is missing.',
      ),
    );
  } else {
    checks.push({
      id: 'balances',
      label: 'Holds the committed contents',
      result: 'skip',
      detail: 'No loan is running, so nothing is committed.',
    });
  }
  return checks;
}
