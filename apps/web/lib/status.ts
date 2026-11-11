import type { PawnStatus } from '@mosaec/domain';
import type { StatusTone } from '@mosaec/ui';

/** Colour of each pawn status. Amber marks the one state that needs the borrower's attention. */
export const STATUS_TONE: Readonly<Record<PawnStatus, StatusTone>> = {
  Open: 'accent',
  Active: 'positive',
  'Due Soon': 'warning',
  Grace: 'warning',
  Pending: 'neutral',
  Redeemed: 'inverse',
  Forfeited: 'negative',
};
