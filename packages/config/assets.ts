/** Network a Mosaec registry serves. Mirrors `Network` in `contracts/shared/src/constants.rs`. */
export const NETWORK_IDS = ['mainnet', 'testnet'] as const;

export type NetworkId = (typeof NETWORK_IDS)[number];

export const ASSET_SYMBOLS = ['ZEC', 'BTC', 'SOL', 'USDC'] as const;

export type AssetSymbol = (typeof ASSET_SYMBOLS)[number];

/** `collateral` sits in a pack; `settlement` pays the principal and the repayment `K`. */
export type AssetRole = 'collateral' | 'settlement';

/** One allowlisted asset. Amounts are in the token's smallest unit. */
export interface Asset {
  readonly symbol: AssetSymbol;
  readonly name: string;
  readonly role: AssetRole;
  readonly decimals: number;
  /** Largest amount of this token one pack may hold or one pawn may settle in. */
  readonly capPerPack: bigint;
  /** Verifier token id on each network. */
  readonly tokenIds: Readonly<Record<NetworkId, string>>;
  /** Chain the bridged token withdraws to. */
  readonly homeChain: string;
}

/**
 * The v0 allowlist. Caps keep funds at risk under $500 in the first mainnet release; testnet
 * uses the same caps. A test fails when any value here differs from `TOKEN_RULES` in Rust.
 */
export const ASSETS = {
  ZEC: {
    symbol: 'ZEC',
    name: 'Zcash',
    role: 'collateral',
    decimals: 8,
    capPerPack: 100_000_000n,
    tokenIds: { mainnet: 'nep141:zec.omft.near', testnet: 'nep141:zec.mosaec.testnet' },
    homeChain: 'Zcash',
  },
  BTC: {
    symbol: 'BTC',
    name: 'Bitcoin',
    role: 'collateral',
    decimals: 8,
    capPerPack: 1_000_000n,
    tokenIds: { mainnet: 'nep141:btc.omft.near', testnet: 'nep141:btc.mosaec.testnet' },
    homeChain: 'Bitcoin',
  },
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    role: 'collateral',
    decimals: 9,
    capPerPack: 5_000_000_000n,
    tokenIds: { mainnet: 'nep141:sol.omft.near', testnet: 'nep141:sol.mosaec.testnet' },
    homeChain: 'Solana',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    role: 'settlement',
    decimals: 6,
    capPerPack: 1_000_000_000n,
    tokenIds: {
      mainnet: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      testnet: 'nep141:usdc.mosaec.testnet',
    },
    homeChain: 'NEAR',
  },
} as const satisfies Record<AssetSymbol, Asset>;

/** The asset whose verifier token id on `network` is `tokenId`, if allowlisted. */
export function assetByTokenId(network: NetworkId, tokenId: string): Asset | undefined {
  return Object.values<Asset>(ASSETS).find((asset) => asset.tokenIds[network] === tokenId);
}

/** Assets that may play `role`. */
export function assetsWithRole(role: AssetRole): readonly Asset[] {
  return Object.values<Asset>(ASSETS).filter((asset) => asset.role === role);
}
