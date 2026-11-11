import Image from 'next/image';

import { ASSET_MARK } from '../../../lib/asset-marks';

import type { AssetSymbol } from '@mosaec/config/assets';

function isAsset(symbol: string): symbol is AssetSymbol {
  return symbol in ASSET_MARK;
}

/** Official mark of an allowlisted coin; a neutral disc for anything else. */
export function CoinMark({
  symbol,
  size = 32,
}: {
  readonly symbol: string | null;
  readonly size?: number;
}) {
  if (symbol === null || !isAsset(symbol)) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--bg-tertiary)',
          flex: 'none',
        }}
      />
    );
  }
  return (
    <Image
      src={ASSET_MARK[symbol]}
      alt=""
      width={size}
      height={size}
      style={{ flex: 'none', borderRadius: '50%' }}
    />
  );
}
