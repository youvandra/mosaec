import type { EventName, PositionView } from './schemas';

/** Labels the app shows for a pawn. The single source for status wording. */
export const PAWN_STATUSES = [
  'Open',
  'Active',
  'Due Soon',
  'Grace',
  'Pending',
  'Redeemed',
  'Forfeited',
] as const;

export type PawnStatus = (typeof PAWN_STATUSES)[number];

/** A pawn counts as due soon this close to its deadline. */
export const DUE_SOON_NS = 3n * 24n * 3_600_000_000_000n;

/**
 * The live status of a position at `nowNs`, from the registry view and, when known, the deadline
 * the pack reports (`status.exercise_deadline_ns`, which includes any recorded grace). Returns
 * `undefined` for a free pack: its last outcome comes from events (`outcomeOf`).
 */
export function liveStatus(
  view: PositionView,
  nowNs: bigint,
  packDeadlineNs?: bigint | null,
): PawnStatus | undefined {
  const { stage } = view.position;
  switch (stage.state) {
    case 'free':
      return undefined;
    case 'offered':
      return 'Open';
    case 'written': {
      if (view.ticket_pending || view.position.command_in_flight) {
        return 'Pending';
      }
      const termEnd = stage.encumbrance.expires_at_ns;
      const deadline = packDeadlineNs ?? termEnd;
      if (nowNs > deadline) {
        return 'Forfeited';
      }
      if (nowNs > termEnd) {
        return 'Grace';
      }
      return termEnd - nowNs <= DUE_SOON_NS ? 'Due Soon' : 'Active';
    }
  }
}

/** The final status a closing event gives a pawn. */
export function outcomeOf(event: EventName): PawnStatus | undefined {
  switch (event) {
    case 'contents_released':
    case 'exercise_decided':
      return 'Redeemed';
    case 'expired':
      return 'Forfeited';
    default:
      return undefined;
  }
}
