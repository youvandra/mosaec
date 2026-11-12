import type { AssetSymbol } from '@mosaec/config/assets';

/** Official token marks (cryptocurrency-icons, CC0), served from `public/tokens`. */
export const ASSET_MARK: Readonly<Record<AssetSymbol, string>> = {
  ZEC: '/tokens/zec.svg',
  BTC: '/tokens/btc.svg',
  SOL: '/tokens/sol.svg',
  USDC: '/tokens/usdc.svg',
};

/** Disc colour of each mark above, read from the same SVGs, for tiles that take the token colour. */
export const ASSET_FILL: Readonly<Record<AssetSymbol, string>> = {
  ZEC: '#ECB244',
  BTC: '#F7931A',
  SOL: '#000000',
  USDC: '#3E73C4',
};

/** NEAR, the chain every pack lives on: the brand N in white on black (glyph from web3icons 4.0.59, MIT). */
export const NEAR_MARK = { symbol: 'NEAR', src: '/tokens/near.svg' } as const;

/** Tile colour for any mark above, keyed by its src, so a coin tile fills edge to edge. */
const MARK_FILL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    (Object.keys(ASSET_MARK) as AssetSymbol[]).map((symbol) => [
      ASSET_MARK[symbol],
      ASSET_FILL[symbol],
    ]),
  ),
  [NEAR_MARK.src]: '#000000',
};

/** The token colour behind a mark, or undefined for a mark without one. */
export function markFill(src: string): string | undefined {
  return MARK_FILL[src];
}

/** The coins a pack can hold or settle in, for tickers. */
export const TICKER_MARKS: readonly { readonly symbol: string; readonly src: string }[] = (
  ['ZEC', 'BTC', 'SOL', 'USDC'] as const
).map((symbol) => ({ symbol, src: ASSET_MARK[symbol] }));
