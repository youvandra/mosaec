import { assetByTokenId } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import { liveStatus } from '@mosaec/domain';
import { MosaecViews, NearRpc } from '@mosaec/sdk';

import { CODE_HASHES } from '../deployments';
import { formatUnits, padCents } from '../format';

import type { NetworkId } from '@mosaec/config/assets';
import type { PawnStatus, PositionView } from '@mosaec/domain';

export type CheckResult = 'pass' | 'fail' | 'skip';

export interface Check {
  readonly id: CheckId;
  readonly label: string;
  readonly result: CheckResult;
  readonly detail: string;
  /** The contract call or RPC query the answer came from. */
  readonly source: string;
}

export interface ContentLine {
  readonly symbol: string | null;
  readonly text: string;
}

/** What the chain says about the pack, read in the same pass as the checks. */
export interface PackSummary {
  readonly index: string | null;
  readonly status: PawnStatus | 'Free' | null;
  readonly titleOwner: string | null;
  readonly ticketOwner: string | null;
  readonly contents: readonly ContentLine[];
  readonly repay: string | null;
  readonly dueNs: bigint | null;
  readonly codeHash: string;
}

export interface PackReport {
  readonly checks: readonly Check[];
  readonly summary: PackSummary;
  /** Final block the account was read at, when the RPC reports it. */
  readonly blockHeight: number | null;
  readonly rpcHost: string;
}

interface AccountView {
  readonly code_hash: string;
  readonly global_contract_hash?: string | null;
  readonly block_height?: number;
}

interface KeyList {
  readonly keys: readonly unknown[];
}

type CheckId = 'registry' | 'keys' | 'code' | 'auth' | 'lock' | 'balances';

export interface PlannedCheck {
  readonly id: CheckId;
  readonly label: string;
  readonly source: string;
}

/** The checks in order, each with the call that answers it. One list for the empty page and the report. */
export function plannedChecks(network: NetworkId): readonly PlannedCheck[] {
  const { registryAccountId: registry, verifierAccountId: verifier } = NETWORKS[network];
  return [
    {
      id: 'registry',
      label: 'Created by the Mosaec registry',
      source: `${registry} · position_of`,
    },
    { id: 'keys', label: 'Zero access keys', source: 'view_access_key_list' },
    { id: 'code', label: 'Runs the published pack code', source: 'view_account · code_hash' },
    {
      id: 'auth',
      label: 'Only the pack moves its coins',
      source: `${verifier} · is_auth_by_predecessor_id_enabled`,
    },
    { id: 'lock', label: 'Unlocked at the verifier', source: `${verifier} · is_account_locked` },
    { id: 'balances', label: 'Holds the pawned coins', source: `${verifier} · mt_balance_of` },
  ];
}

function lineOf(network: NetworkId, tokenId: string, amount: bigint): ContentLine {
  const asset = assetByTokenId(network, tokenId);
  if (asset === undefined) return { symbol: null, text: `${amount.toString()} ${tokenId}` };
  const settlement = asset.role === 'settlement';
  const value = formatUnits(amount, asset.decimals, settlement ? 2 : 4);
  return { symbol: asset.symbol, text: `${settlement ? padCents(value) : value} ${asset.symbol}` };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function contentsOf(
  network: NetworkId,
  views: MosaecViews,
  packId: string,
  position: PositionView | undefined,
): Promise<readonly ContentLine[]> {
  const stage = position?.position.stage;
  if (stage?.state === 'written') {
    return stage.encumbrance.contents.map((line) => lineOf(network, line.token_id, line.amount));
  }
  if (stage?.state === 'offered') {
    return stage.contents.map((line) => lineOf(network, line.token_id, line.amount));
  }
  if (position === undefined) return [];
  const holdings = await views.holdingsOf(packId);
  return holdings.map((line) => lineOf(network, line.token_id, line.amount));
}

/**
 * Every check runs in the browser against public RPC: the pack account, the verifier and the
 * registry. Nothing comes from the Mosaec API.
 */
export async function verifyPack(network: NetworkId, packId: string): Promise<PackReport> {
  const config = NETWORKS[network];
  const rpc = new NearRpc(config.rpcUrl);
  const views = new MosaecViews(network, rpc);
  const published = CODE_HASHES[network]?.pack ?? null;
  const registry = config.registryAccountId;
  const verifier = config.verifierAccountId;

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
    rpc.view(verifier, 'is_auth_by_predecessor_id_enabled', { account_id: packId }),
    rpc.view(verifier, 'is_account_locked', { account_id: packId }),
    views.positionOf(packId),
  ]);

  const spec = Object.fromEntries(plannedChecks(network).map((item) => [item.id, item])) as Record<
    CheckId,
    PlannedCheck
  >;
  const check = (id: CheckId, pass: boolean, detail: string): Check => ({
    ...spec[id],
    result: pass ? 'pass' : 'fail',
    detail,
  });

  const codeHash = account.global_contract_hash ?? account.code_hash;
  const keyCount = keys.keys.length;
  const checks: Check[] = [
    check(
      'registry',
      position !== undefined,
      position === undefined
        ? `${registry} has no record of this account.`
        : `${registry} records it as pack #${position.position.index.toString()}.`,
    ),
    check(
      'keys',
      keyCount === 0,
      keyCount === 0
        ? 'Nobody holds a key to this account.'
        : `${keyCount.toString()} ${keyCount === 1 ? 'key' : 'keys'} can sign for this account.`,
    ),
    check(
      'code',
      published !== null && codeHash === published,
      published !== null && codeHash === published
        ? 'Same code as every other Mosaec pack.'
        : 'The code differs from the published pack.',
    ),
    check(
      'auth',
      predecessorAuth === true,
      predecessorAuth === true
        ? 'The verifier takes moves from the pack contract alone.'
        : 'The verifier would take moves signed by a key.',
    ),
    check(
      'lock',
      locked === false,
      locked === false ? 'No lock on this account.' : 'The verifier has locked this account.',
    ),
  ];

  const stage = position?.position.stage;
  if (stage?.state === 'written') {
    const committed = stage.encumbrance.contents;
    const balances = await Promise.all(
      committed.map((line) => views.balanceOf(packId, line.token_id)),
    );
    const matches = committed.every((line, index) => (balances[index] ?? 0n) >= line.amount);
    checks.push(
      check(
        'balances',
        matches,
        matches ? 'Every pawned coin is in the pack.' : 'A pawned coin is missing.',
      ),
    );
  } else {
    checks.push({
      ...spec.balances,
      result: 'skip',
      detail: 'No loan is running, so nothing is pawned.',
    });
  }

  const contents = await contentsOf(network, views, packId, position);
  const repay =
    stage?.state === 'written'
      ? lineOf(network, stage.encumbrance.k_token, stage.encumbrance.k_amount).text
      : stage?.state === 'offered'
        ? lineOf(network, stage.terms.k_token, stage.terms.k_amount).text
        : null;
  const nowNs = BigInt(Date.now()) * 1_000_000n;

  return {
    checks,
    summary: {
      index: position === undefined ? null : position.position.index.toString(),
      status: position === undefined ? null : (liveStatus(position, nowNs) ?? 'Free'),
      titleOwner: position?.title_owner ?? null,
      ticketOwner: position?.ticket_owner ?? null,
      contents,
      repay,
      dueNs: stage?.state === 'written' ? stage.encumbrance.expires_at_ns : null,
      codeHash,
    },
    blockHeight: typeof account.block_height === 'number' ? account.block_height : null,
    rpcHost: hostOf(config.rpcUrl),
  };
}
