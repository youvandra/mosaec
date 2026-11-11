import type { AssetSymbol } from '@mosaec/config/assets';

/** Official token marks (cryptocurrency-icons, CC0), served from `public/tokens`. */
export const ASSET_MARK: Readonly<Record<AssetSymbol, string>> = {
  ZEC: '/tokens/zec.svg',
  BTC: '/tokens/btc.svg',
  SOL: '/tokens/sol.svg',
  USDC: '/tokens/usdc.svg',
};
