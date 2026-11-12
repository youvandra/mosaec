import { AppIcon } from '@mosaec/ui';

import { ASSET_FILL } from '../../../lib/asset-marks';

import { CoinMark } from './CoinMark';

/** A coin mark inside the source's icon tile, for list rows and cards. */
export function CoinTile({
  symbol,
  size = 36,
}: {
  readonly symbol: string | null;
  readonly size?: number;
}) {
  return (
    <AppIcon
      color="light"
      size={size}
      mark
      fill={
        symbol !== null && symbol in ASSET_FILL
          ? ASSET_FILL[symbol as keyof typeof ASSET_FILL]
          : undefined
      }
    >
      <CoinMark symbol={symbol} size={Math.round(size * 0.62)} />
    </AppIcon>
  );
}
