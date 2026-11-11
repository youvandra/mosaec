import type { PackRow } from './repository';
import type { PackStatus, PositionView } from '@mosaec/domain';

/** Reads the chain's current view of a pack. */
export interface PackReader {
  positionOf(pack: string): Promise<PositionView | undefined>;
  packStatus(pack: string): Promise<PackStatus>;
}

const EMPTY_TERMS = {
  ticketId: null,
  payToken: null,
  price: null,
  makerId: null,
  kToken: null,
  kAmount: null,
  termNs: null,
  offerExpiresAtNs: null,
  expiresAtNs: null,
  deadlineNs: null,
  disruptedAtNs: null,
  contents: null,
  contentsHash: null,
} as const;

function contentsJson(lines: readonly { token_id: string; amount: bigint }[]): unknown {
  return lines.map((l) => ({ token_id: l.token_id, amount: l.amount.toString() }));
}

/** Maps the registry and pack views to a `packs` row. Pure. */
export function packRow(
  network: string,
  view: PositionView,
  status: PackStatus,
  extra: {
    refreshedHeight: bigint;
    lastOutcome: 'Redeemed' | 'Forfeited' | null;
    mintedHeight: bigint | null;
  },
): PackRow {
  const { position } = view;
  const base: PackRow = {
    network,
    packId: view.pack,
    packIndex: position.index,
    titleId: position.title_id,
    titleOwner: view.title_owner,
    ticketOwner: view.ticket_owner,
    state: position.stage.state,
    rounds: position.rounds,
    ticketPending: view.ticket_pending,
    commandInFlight: position.command_in_flight,
    ...EMPTY_TERMS,
    ...extra,
  };
  const { stage } = position;
  switch (stage.state) {
    case 'free':
      return base;
    case 'offered':
      return {
        ...base,
        makerId: stage.maker_id,
        payToken: stage.pay_token,
        price: stage.price.toString(),
        kToken: stage.terms.k_token,
        kAmount: stage.terms.k_amount.toString(),
        termNs: stage.terms.term_ns.toString(),
        offerExpiresAtNs: stage.open_until_ns.toString(),
        contents: contentsJson(stage.contents),
        contentsHash: stage.contents_hash,
      };
    case 'written': {
      const disrupted = status.phase.state === 'written' ? status.phase.disrupted_at_ns : null;
      return {
        ...base,
        ticketId: stage.ticket_id,
        kToken: stage.encumbrance.k_token,
        kAmount: stage.encumbrance.k_amount.toString(),
        expiresAtNs: stage.encumbrance.expires_at_ns.toString(),
        deadlineNs: status.exercise_deadline_ns?.toString() ?? null,
        disruptedAtNs: disrupted?.toString() ?? null,
        contents: contentsJson(stage.encumbrance.contents),
      };
    }
  }
}
