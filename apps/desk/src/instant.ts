import { randomUUID } from 'node:crypto';

import { ASSETS } from '@mosaec/config/assets';
import { repaymentFor } from '@mosaec/config/rates';

import { collateralValueUsdc, evaluate, pauseReason } from './policy';
import { INSTANT_ACTOR, utcMidnight } from './repository';

import type { DeskService, FillResult } from './desk-service';
import type { OfferInput, Quote } from './policy';
import type { DeskSymbol } from './prices';
import type { QuoteSigner, QuoteTerms } from './quote-token';
import type { RateCards } from './rate-card';
import type { DeskRepository } from './repository';
import type { ErrorCode } from '@mosaec/domain';

/** How long the desk honours a quote, loan to value included. */
export const QUOTE_TTL_MS = 10 * 60_000;
const CLOCK_SLACK_MS = 60_000;
/** Reads of a missing offer before the fill gives up, one gap apart. */
const OFFER_READS = 8;
const OFFER_READ_GAP_MS = 1_000;
/** Fill tasks allowed to wait for the lock before an instant fill is turned away as busy. */
export const MAX_QUEUED_FILLS = 10;
const BPS = 10_000n;
const USDC_WHOLE = 1_000_000n;
const NS_PER_MS = 1_000_000n;

type DeskCode = Extract<ErrorCode, `DESK_${string}`>;

export interface QuoteRequest {
  readonly asset: DeskSymbol;
  /** Coins the borrower seals, smallest unit. */
  readonly amount: bigint;
  /** USDC the borrower asks for; absent asks for the most the desk lends on these coins. */
  readonly principal?: bigint | undefined;
  readonly termNs: bigint;
  /** Borrower account, so a running instant loan can be refused at quote time. */
  readonly borrower?: string | undefined;
}

export interface InstantQuote extends QuoteTerms {
  readonly quoteId: string;
  readonly aprBps: number;
  readonly ltvBps: number;
  readonly monthlyBps: number;
}

export type QuoteAnswer =
  | { readonly available: true; readonly quote: InstantQuote }
  | { readonly available: false; readonly code: DeskCode; readonly reason: string };

export interface FillRequest extends QuoteTerms {
  readonly pack: string;
  readonly quoteId: string;
}

/**
 * The instant desk loan. A quote is a promise priced from the current rate card; while it stands,
 * the desk fills an offer carrying exactly those terms, with no model in the path.
 */
export class InstantDesk {
  private readonly inFlight = new Map<string, Promise<FillResult>>();

  constructor(
    private readonly desk: DeskService,
    private readonly repository: DeskRepository,
    private readonly cards: RateCards,
    private readonly signer: QuoteSigner,
    private readonly now: () => number = Date.now,
    private readonly offerPoll: { readonly reads: number; readonly gapMs: number } = {
      reads: OFFER_READS,
      gapMs: OFFER_READ_GAP_MS,
    },
  ) {}

  async quote(request: QuoteRequest): Promise<QuoteAnswer> {
    const unavailable = (code: DeskCode, reason: string): QuoteAnswer => ({
      available: false,
      code,
      reason,
    });
    const { network, policy } = this.desk;
    const context = await this.desk.context();
    const paused = pauseReason(context);
    if (paused !== null) return unavailable('DESK_PAUSED', paused);
    if (!policy.assets.includes(request.asset)) {
      return unavailable('DESK_POLICY', `${request.asset} is outside the desk policy.`);
    }
    if (request.amount <= 0n) return unavailable('DESK_POLICY', 'The pack holds no coins.');
    if (request.termNs < policy.minTermNs || request.termNs > policy.maxTermNs) {
      return unavailable('DESK_POLICY', 'The term sits outside the desk range.');
    }
    const usd = context.pricesUsd[request.asset];
    if (usd === undefined) {
      return unavailable('DESK_PRICE', `No fresh reference price for ${request.asset} right now.`);
    }
    if (request.borrower !== undefined) {
      const limit = await this.makerLimit(request.borrower);
      if (limit !== null) return unavailable(limit.code, limit.reason);
    }

    const card = await this.cards.current(request.asset);
    const asset = ASSETS[request.asset];
    const value = collateralValueUsdc(request.amount, asset.decimals, usd);
    const ltvCap = BigInt(Math.min(card.maxLtvBps, policy.maxLtvBps));
    const most = ((value * ltvCap) / BPS / USDC_WHOLE) * USDC_WHOLE;
    const capped = most < policy.maxFillUsdc ? most : policy.maxFillUsdc;
    const principal =
      request.principal === undefined || request.principal > capped ? capped : request.principal;
    if (principal < policy.minFillUsdc) {
      return unavailable('DESK_POLICY', 'These coins support less than the smallest desk loan.');
    }

    const nowMs = this.now();
    const terms: QuoteTerms = {
      network,
      asset: request.asset,
      amount: request.amount,
      principal,
      repayment: repaymentFor(principal, card.monthlyBps, request.termNs),
      termNs: request.termNs,
      expiresAtMs: nowMs + QUOTE_TTL_MS,
      cardId: card.id,
    };
    /* The same rule set as every fill, on the offer this quote asks the borrower to make. */
    const verdict = evaluate(this.offerFor(terms, request.borrower ?? ''), context, {
      lane: 'instant',
    });
    if (!verdict.ok) return unavailable(verdict.code, verdict.reason);
    return {
      available: true,
      quote: {
        ...terms,
        quoteId: this.signer.sign(terms),
        aprBps: verdict.quote.aprBps,
        ltvBps: verdict.quote.ltvBps,
        monthlyBps: card.monthlyBps,
      },
    };
  }

  /**
   * Fills `request.pack` when its live offer carries exactly the quoted terms. Verifies the quote
   * id and expiry first, waits for the offer to show, then under the desk-wide fill lock re-runs
   * the policy, honouring the quoted loan to value. A repeated call for a filled quote returns the
   * first result.
   */
  async fill(request: FillRequest): Promise<FillResult> {
    const refuse = (code: DeskCode, reason: string): FillResult => ({
      status: 'refused',
      code,
      reason,
    });
    if (request.network !== this.desk.network || !this.signer.verify(request, request.quoteId)) {
      return refuse('DESK_QUOTE_INVALID', 'The desk did not issue this quote.');
    }
    if (request.expiresAtMs <= this.now()) {
      return refuse('DESK_QUOTE_EXPIRED', 'The quote has expired; ask for a new one.');
    }
    /* A repeat for a pack already being filled joins that call: one fill per pack at a time. */
    const running = this.inFlight.get(request.pack);
    if (running !== undefined) return running;
    const task = this.fillOnce(request).finally(() => this.inFlight.delete(request.pack));
    this.inFlight.set(request.pack, task);
    return task;
  }

  private async fillOnce(request: FillRequest): Promise<FillResult> {
    const refuse = (code: DeskCode, reason: string): FillResult => ({
      status: 'refused',
      code,
      reason,
    });
    const earlier = await this.earlierFill(request);
    if (earlier !== null) return earlier;
    /* Wait for the offer outside the lock, so a pack that is never offered holds up no one. */
    if ((await this.offerOf(request.pack)) === null) {
      return (await this.earlierFill(request)) ?? refuse('DESK_POLICY', 'The pack is not offered.');
    }
    if (this.desk.fillsQueued >= MAX_QUEUED_FILLS) {
      return refuse('DESK_BUSY', 'The desk is working through other fills; try again shortly.');
    }
    return this.desk.exclusive(async () => {
      const filled = await this.earlierFill(request);
      if (filled !== null) return filled;
      const offer = await this.desk.liveOffer(request.pack);
      if (offer === null) return refuse('DESK_POLICY', 'The pack is not offered.');
      const mismatch = this.mismatch(offer, request);
      if (mismatch !== null) return refuse('DESK_QUOTE_MISMATCH', mismatch);
      if (offer.titleOwner !== offer.makerId) {
        return refuse('DESK_POLICY', 'The offer maker no longer holds the Title.');
      }
      const limit = await this.makerLimit(offer.makerId);
      if (limit !== null) return refuse(limit.code, limit.reason);
      return this.desk.fillChecked(
        offer,
        { lane: 'instant', honourQuotedLtv: true },
        randomUUID(),
        INSTANT_ACTOR,
        `Instant loan at card ${request.cardId}.`,
      );
    });
  }

  /** Why `makerId` may not take another instant loan now, or null when it may. */
  private async makerLimit(
    makerId: string,
  ): Promise<{ readonly code: DeskCode; readonly reason: string } | null> {
    const { network, policy } = this.desk;
    if (await this.repository.hasOpenInstantLoan(network, policy.deskAccountId, makerId)) {
      return {
        code: 'DESK_OPEN_LOAN',
        reason: 'This account already has an instant desk loan running.',
      };
    }
    const today = utcMidnight(new Date(this.now()));
    const taken = await this.repository.instantFillsByMakerSince(network, makerId, today);
    if (taken >= policy.maxInstantFillsPerMakerPerDay) {
      return {
        code: 'DESK_MAKER_LIMIT',
        reason: `This account took its ${policy.maxInstantFillsPerMakerPerDay.toString()} instant desk loans for today.`,
      };
    }
    return null;
  }

  /** The desk's earlier fill of this pack on these exact terms since the quote was issued. */
  private async earlierFill(request: FillRequest): Promise<FillResult | null> {
    /* A minute of slack covers clock skew between the desk and the database. */
    const issuedAt = new Date(request.expiresAtMs - QUOTE_TTL_MS - CLOCK_SLACK_MS);
    const earlier = await this.repository.instantFillSince(
      this.desk.network,
      request.pack,
      issuedAt,
    );
    if (earlier === null || !sameTerms(earlier.quote, request)) return null;
    return { status: 'filled', txHash: earlier.txHash, quote: earlier.quote };
  }

  /**
   * The live offer on `pack`. The app asks for the fill the moment the borrower's offer settles,
   * and final-state reads trail that by a few blocks, so a missing offer is read again briefly.
   */
  private async offerOf(pack: string): Promise<OfferInput | null> {
    for (let attempt = 1; ; attempt += 1) {
      const offer = await this.desk.liveOffer(pack);
      if (offer !== null || attempt >= this.offerPoll.reads) return offer;
      await new Promise((resolve) => setTimeout(resolve, this.offerPoll.gapMs));
    }
  }

  /** Why the live offer differs from the quote, or null when every term matches. */
  private mismatch(offer: OfferInput, terms: QuoteTerms): string | null {
    const usdcId = ASSETS.USDC.tokenIds[this.desk.network];
    const coinId = ASSETS[terms.asset as DeskSymbol].tokenIds[this.desk.network];
    const [line, ...rest] = offer.contents;
    if (offer.payToken !== usdcId || offer.kToken !== usdcId) return 'The offer is not in USDC.';
    if (line === undefined || rest.length > 0 || line.tokenId !== coinId) {
      return 'The pack holds different coins than the quote.';
    }
    if (line.amount !== terms.amount) return 'The pack holds a different amount than the quote.';
    if (offer.price !== terms.principal) return 'The offer asks a different loan than the quote.';
    if (offer.kAmount !== terms.repayment) return 'The offer repays a different amount.';
    if (offer.termNs !== terms.termNs) return 'The offer runs for a different term.';
    return null;
  }

  private offerFor(terms: QuoteTerms, makerId: string): OfferInput {
    const usdcId = ASSETS.USDC.tokenIds[this.desk.network];
    return {
      pack: 'quote',
      makerId,
      payToken: usdcId,
      price: terms.principal,
      kToken: usdcId,
      kAmount: terms.repayment,
      termNs: terms.termNs,
      openUntilNs: BigInt(terms.expiresAtMs) * NS_PER_MS,
      contents: [
        {
          tokenId: ASSETS[terms.asset as DeskSymbol].tokenIds[this.desk.network],
          amount: terms.amount,
        },
      ],
      contentsHash: '',
    };
  }
}

function sameTerms(quote: Quote, terms: QuoteTerms): boolean {
  return (
    quote.principal === terms.principal.toString() &&
    quote.repayment === terms.repayment.toString() &&
    quote.termNs === terms.termNs.toString()
  );
}
