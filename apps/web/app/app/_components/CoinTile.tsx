import { AppIcon } from '@mosaec/ui';

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
    <AppIcon color="light" size={size} mark>
      <CoinMark symbol={symbol} size={Math.round(size * 0.62)} />
    </AppIcon>
  );
}
