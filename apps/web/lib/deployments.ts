import type { NetworkId } from '@mosaec/config/assets';

/** Published code hashes per network, as recorded at deploy time. `null` until deployed. */
export const CODE_HASHES: Readonly<Record<NetworkId, { pack: string; registry: string } | null>> = {
  mainnet: null,
  testnet: {
    pack: '4NVfLnVFYQxUPfsHRGpU6h8eKmp2AbQxNR2mYNx3Bwzc',
    registry: '7XzqvXMawMojL1mYSJbw15ha6BoLg7vV8S1YgCHTyUxg',
  },
};

/** First and last characters of a long id. */
export function shortHash(value: string, keep = 6): string {
  return value.length <= keep * 2 + 1 ? value : `${value.slice(0, keep)}…${value.slice(-keep)}`;
}
