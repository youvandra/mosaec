import { ASSET_SYMBOLS, NETWORK_IDS } from './assets';

import type { AssetSymbol, NetworkId } from './assets';

const NS_PER_MINUTE = 60_000_000_000n;
const NS_PER_DAY = 24n * 60n * NS_PER_MINUTE;

/** Everything the app, API and indexer need to talk to one network. */
export interface NetworkConfig {
  readonly id: NetworkId;
  /** Selectable in the app. A network stays listed while disabled so the toggle keeps its place. */
  readonly enabled: boolean;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  /** FastNEAR neardata archive the indexer reads blocks from. */
  readonly neardataUrl: string;
  /** Block that deployed the registry; the indexer starts there. `null` until deployed. */
  readonly registryDeployHeight: bigint | null;
  readonly rootAccountId: string;
  readonly registryAccountId: string;
  readonly verifierAccountId: string;
  /** Inclusive term bounds the registry accepts, in nanoseconds. */
  readonly termBoundsNs: { readonly min: bigint; readonly max: bigint };
  /** Assets the app offers on this network. */
  readonly assets: readonly AssetSymbol[];
}

/** Longest term on every network (`MAX_TERM_NS`). */
export const MAX_TERM_NS = 180n * NS_PER_DAY;
/** Shortest term on mainnet (`MIN_TERM_NS`). */
export const MIN_TERM_NS = 7n * NS_PER_DAY;
/** Shortest term on testnet (`TESTNET_MIN_TERM_NS`), so a rehearsal expires within the hour. */
export const TESTNET_MIN_TERM_NS = 10n * NS_PER_MINUTE;
/** Term the app proposes by default (`DEFAULT_TERM_NS`). */
export const DEFAULT_TERM_NS = 90n * NS_PER_DAY;
/** Disruption window before `T` and grace after it (`GRACE_NS`). */
export const GRACE_NS = NS_PER_DAY;

/**
 * Per-network values. Testnet runs the hackathon release; mainnet is listed and disabled until
 * `v0.mosaec.near` is deployed.
 */
export const NETWORKS = {
  mainnet: {
    id: 'mainnet',
    enabled: false,
    rpcUrl: 'https://free.rpc.fastnear.com',
    explorerUrl: 'https://nearblocks.io',
    neardataUrl: 'https://mainnet.neardata.xyz',
    registryDeployHeight: null,
    rootAccountId: 'mosaec.near',
    registryAccountId: 'v0.mosaec.near',
    verifierAccountId: 'intents.near',
    termBoundsNs: { min: MIN_TERM_NS, max: MAX_TERM_NS },
    assets: ASSET_SYMBOLS,
  },
  testnet: {
    id: 'testnet',
    enabled: true,
    rpcUrl: 'https://rpc.testnet.fastnear.com',
    explorerUrl: 'https://testnet.nearblocks.io',
    neardataUrl: 'https://testnet.neardata.xyz',
    registryDeployHeight: 277_143_566n,
    rootAccountId: 'mosaec.testnet',
    registryAccountId: 'v0.mosaec.testnet',
    verifierAccountId: 'intents.mosaec.testnet',
    termBoundsNs: { min: TESTNET_MIN_TERM_NS, max: MAX_TERM_NS },
    assets: ['ZEC', 'USDC'],
  },
} as const satisfies Record<NetworkId, NetworkConfig>;

/** The network the app opens on: the first enabled one. */
export const DEFAULT_NETWORK: NetworkId = (() => {
  const first = NETWORK_IDS.find((id) => NETWORKS[id].enabled);
  if (first === undefined) {
    throw new Error('at least one network must be enabled');
  }
  return first;
})();

/** Explorer link for a transaction. */
export function explorerTxUrl(network: NetworkId, txHash: string): string {
  return `${NETWORKS[network].explorerUrl}/txns/${txHash}`;
}

/** Explorer link for an account. */
export function explorerAccountUrl(network: NetworkId, accountId: string): string {
  return `${NETWORKS[network].explorerUrl}/address/${accountId}`;
}
