import type { AssetSymbol } from '@mosaec/config/assets';

/** Official token marks (cryptocurrency-icons, CC0), served from `public/tokens`. */
export const ASSET_MARK: Readonly<Record<AssetSymbol, string>> = {
  ZEC: '/tokens/zec.svg',
  BTC: '/tokens/btc.svg',
  SOL: '/tokens/sol.svg',
  USDC: '/tokens/usdc.svg',
};

/** NEAR, the chain every pack lives on: the brand N in white on black (glyph from web3icons 4.0.59, MIT). */
export const NEAR_MARK = { symbol: 'NEAR', src: '/tokens/near.svg' } as const;

/** Marks for coins shown only as decoration in tickers; none of them is on the allowlist. */
export const DECOR_MARKS: readonly { readonly symbol: string; readonly src: string }[] = [
  { symbol: 'ETH', src: '/tokens/eth.svg' },
  { symbol: 'DOGE', src: '/tokens/doge.svg' },
  { symbol: 'LTC', src: '/tokens/ltc.svg' },
  { symbol: 'XRP', src: '/tokens/xrp.svg' },
  { symbol: 'BCH', src: '/tokens/bch.svg' },
  { symbol: 'ADA', src: '/tokens/ada.svg' },
  { symbol: 'TRX', src: '/tokens/trx.svg' },
  { symbol: 'DASH', src: '/tokens/dash.svg' },
];

/** NEAR first, then allowlisted coins interleaved with decorative ones, for tickers. */
export const TICKER_MARKS: readonly { readonly symbol: string; readonly src: string }[] = [
  NEAR_MARK,
  ...(['ZEC', 'BTC', 'SOL', 'USDC'] as const).flatMap((symbol, index) => [
    { symbol, src: ASSET_MARK[symbol] },
    ...DECOR_MARKS.slice(index * 2, index * 2 + 2),
  ]),
];
