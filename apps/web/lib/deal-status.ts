import {
  CheckIcon,
  DotsThreeIcon,
  ClockCountdownIcon,
  HourglassLowIcon,
  PackageIcon,
  VaultIcon,
  XIcon,
} from '@phosphor-icons/react/dist/ssr';

import type { DealOutcome } from './deal';
import type { PawnStatus } from '@mosaec/domain';
import type { StatusTone } from '@mosaec/ui';
import type { Icon } from '@phosphor-icons/react';

export interface DealStatus {
  readonly label: string;
  readonly tone: StatusTone;
  /** Absent for live states, which carry the dot instead. */
  readonly icon?: Icon;
}

/** One vocabulary for how a pawn stands, used by every list, card and page header. */
export const DEAL_STATUS: Readonly<Record<DealOutcome, DealStatus>> = {
  listed: { label: 'Open', tone: 'accent' },
  running: { label: 'Active', tone: 'positive' },
  redeemed: { label: 'Repaid', tone: 'positive', icon: CheckIcon },
  forfeited: { label: 'Coins Kept', tone: 'negative', icon: VaultIcon },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: XIcon },
  empty: { label: 'Free', tone: 'neutral', icon: PackageIcon },
};

/** The same vocabulary for a pack's live status as the indexer reports it. */
export const PAWN_STATUS: Readonly<Record<PawnStatus | 'Free', DealStatus>> = {
  Free: DEAL_STATUS.empty,
  Open: DEAL_STATUS.listed,
  Active: DEAL_STATUS.running,
  'Due Soon': { label: 'Due Soon', tone: 'warning', icon: ClockCountdownIcon },
  Grace: { label: 'Grace', tone: 'warning', icon: HourglassLowIcon },
  Pending: { label: 'Pending', tone: 'neutral', icon: DotsThreeIcon },
  Redeemed: DEAL_STATUS.redeemed,
  Forfeited: DEAL_STATUS.forfeited,
};
