import { assetByTokenId } from '@mosaec/config/assets';
import { aprBps } from '@mosaec/sdk';

import type { Amount, Pack, PackDetail, PackEvent } from './api';
import type { NetworkId } from '@mosaec/config/assets';

/** Where a pawn ended up, or stands now. */
export type DealOutcome = 'listed' | 'running' | 'redeemed' | 'forfeited' | 'cancelled' | 'empty';

/**
 * One round of a pack read as a deal: the coins, the loan, the repayment and the dates. Live
 * fields win; once a round settles the chain clears them, so they come from the event history.
 */
export interface Deal {
  readonly collateral: readonly Amount[];
  readonly principal: Amount | null;
  readonly repayment: Amount | null;
  readonly termNs: string | null;
  readonly listedAtNs: string | null;
  readonly filledAtNs: string | null;
  readonly dueNs: string | null;
  readonly settledAtNs: string | null;
  readonly borrower: string | null;
  readonly lender: string | null;
  readonly outcome: DealOutcome;
}

interface OfferCreated {
  readonly price?: string;
  readonly pay_token?: string;
  readonly maker_id?: string;
  readonly terms?: {
    readonly k_token?: string;
    readonly k_amount?: string;
    readonly term_ns?: number | string;
  };
  readonly contents?: readonly { readonly token_id?: string; readonly amount?: string }[];
}

interface Filled {
  readonly taker_id?: string;
  readonly expires_at_ns?: number | string;
}

function record(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

function amountOf(
  network: NetworkId,
  tokenId: string | undefined,
  amount: string | undefined,
): Amount | null {
  if (tokenId === undefined || amount === undefined) return null;
  const asset = assetByTokenId(network, tokenId);
  return {
    tokenId,
    symbol: asset?.symbol ?? null,
    decimals: asset?.decimals ?? null,
    amount,
  };
}

/** A JSON number that lost precision prints in exponent form; keep the integer digits only. */
function nsText(value: number | string | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'string') return value;
  return BigInt(Math.round(value)).toString();
}

function mosaecEvents(history: readonly PackEvent[]): readonly PackEvent[] {
  return [...history]
    .filter((event) => event.standard === 'mosaec')
    .sort((a, b) => Number(BigInt(a.height) - BigInt(b.height)));
}

/** The latest round of `pack`, live state first and history for whatever the chain cleared. */
export function dealOf(network: NetworkId, pack: PackDetail): Deal {
  const events = mosaecEvents(pack.history);
  const lastOffer = [...events].reverse().find((event) => event.event === 'offer_created');
  const after = lastOffer === undefined ? [] : events.slice(events.indexOf(lastOffer) + 1);
  const offer = record(lastOffer?.data) as OfferCreated;
  const filledEvent = after.find((event) => event.event === 'filled');
  const filled = record(filledEvent?.data) as Filled;
  const end = after.find((event) =>
    ['exercise_decided', 'expired', 'offer_cancelled'].includes(event.event),
  );

  const historyCollateral = (offer.contents ?? [])
    .map((line) => amountOf(network, line.token_id, line.amount))
    .filter((line): line is Amount => line !== null);

  const outcome: DealOutcome =
    pack.state === 'offered'
      ? 'listed'
      : pack.state === 'written'
        ? 'running'
        : end?.event === 'exercise_decided'
          ? 'redeemed'
          : end?.event === 'expired'
            ? 'forfeited'
            : end?.event === 'offer_cancelled'
              ? 'cancelled'
              : 'empty';

  const usesHistory = outcome !== 'listed' && outcome !== 'running';
  return {
    collateral: pack.contents.length > 0 && !usesHistory ? pack.contents : historyCollateral,
    principal: pack.offer?.price ?? amountOf(network, offer.pay_token, offer.price),
    repayment:
      pack.terms?.repayment ?? amountOf(network, offer.terms?.k_token, offer.terms?.k_amount),
    termNs: pack.terms?.termNs ?? nsText(offer.terms?.term_ns),
    listedAtNs: lastOffer?.timestampNs ?? null,
    filledAtNs: filledEvent?.timestampNs ?? null,
    dueNs: pack.terms?.expiresAtNs ?? nsText(filled.expires_at_ns),
    settledAtNs: end?.timestampNs ?? null,
    borrower: offer.maker_id ?? null,
    lender: filled.taker_id ?? null,
    outcome: lastOffer === undefined ? 'empty' : outcome,
  };
}

/** How a free pack's last round ended, from the status the read model keeps. */
function closedOutcome(pack: Pack): DealOutcome {
  if (pack.status === 'Redeemed') return 'redeemed';
  if (pack.status === 'Forfeited') return 'forfeited';
  return 'empty';
}

/**
 * A deal for a list row, where history is absent: live fields only. A free pack still says how
 * its last round ended, so a list degrades to fewer numbers rather than to "empty".
 */
export function liveDealOf(pack: Pack): Deal {
  return {
    collateral: pack.contents,
    principal: pack.offer?.price ?? null,
    repayment: pack.terms?.repayment ?? null,
    termNs: pack.terms?.termNs ?? null,
    listedAtNs: null,
    filledAtNs: null,
    dueNs: pack.terms?.expiresAtNs ?? null,
    settledAtNs: null,
    borrower: pack.offer?.maker ?? null,
    lender: null,
    outcome:
      pack.state === 'offered'
        ? 'listed'
        : pack.state === 'written'
          ? 'running'
          : closedOutcome(pack),
  };
}

const NS_PER_DAY = 86_400_000_000_000n;

/**
 * Simple yearly rate in percent, or `null` when the deal lacks a price or a term. Terms under a
 * day are testnet rehearsals; a yearly rate on them reads as nonsense, so none is shown.
 */
export function dealApr(deal: Deal): number | null {
  if (deal.principal === null || deal.repayment === null || deal.termNs === null) return null;
  if (BigInt(deal.termNs) < NS_PER_DAY) return null;
  if (deal.principal.tokenId !== deal.repayment.tokenId) return null;
  try {
    return (
      Number(
        aprBps(BigInt(deal.principal.amount), BigInt(deal.repayment.amount), BigInt(deal.termNs)),
      ) / 100
    );
  } catch {
    return null;
  }
}

/** Interest in the settlement token's smallest unit. */
export function dealInterest(deal: Deal): bigint | null {
  if (deal.principal === null || deal.repayment === null) return null;
  return BigInt(deal.repayment.amount) - BigInt(deal.principal.amount);
}
