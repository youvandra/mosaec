import { mosaecCalls } from '@mosaec/sdk';

import { evaluate, offerKey, pauseReason } from './policy';
import { utcMidnight } from './repository';
import { Serial } from './serial';

import type { DeskChain } from './chain';
import type { DeskContext, EvaluateOptions, OfferInput, Quote, Verdict } from './policy';
import type { ReferencePrices } from './prices';
import type { DeskRepository } from './repository';
import type { NetworkId } from '@mosaec/config/assets';
import type { DeskPolicy } from '@mosaec/config/desk';
import type { ContractCall } from '@mosaec/sdk';

const NS_PER_MS = 1_000_000n;
const HOUR_MS = 3_600_000;
/** The loop leaves an offer this long to the instant path before it looks at it. */
export const INSTANT_HEAD_START_MS = 2 * 60_000;

export interface OfferReview {
  readonly offer: OfferInput;
  readonly verdict: Verdict;
  /** Block time the offer was opened, when the indexer has it. */
  readonly openedAtNs?: bigint | null;
}

export type FillResult =
  | { readonly status: 'filled'; readonly txHash: string; readonly quote: Quote }
  | {
      readonly status: 'refused' | 'error';
      readonly code: string;
      readonly reason: string;
      readonly txHash?: string;
    };

export interface CollectResult {
  readonly pack: string;
  readonly tokenId: string;
  readonly amount: bigint;
  readonly status: 'collected' | 'error';
  readonly txHash: string | null;
  readonly reason?: string;
}

/**
 * The desk's one rule set, shared by the agent loop, the MCP tools and instant loans: every read
 * re-checks the chain, and every fill re-runs the policy on fresh data right before it signs.
 */
export class DeskService {
  /** One lock around every fill path, so budget and exposure checks cannot race. */
  private readonly fills = new Serial();

  constructor(
    readonly network: NetworkId,
    readonly policy: DeskPolicy,
    private readonly chain: DeskChain,
    private readonly repository: DeskRepository,
    private readonly prices: ReferencePrices,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async context(): Promise<DeskContext> {
    const now = this.now();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const [
      pricesUsd,
      deskBalanceUsdc,
      exposureUsdc,
      lentTodayUsdc,
      fillsLastHour,
      instantFillsLastHour,
      control,
    ] = await Promise.all([
      this.prices.current(),
      this.chain.balanceUsdc(),
      this.repository.exposure(this.network, this.policy.deskAccountId),
      this.repository.lentSince(this.network, utcMidnight(now)),
      this.repository.fillsSince(this.network, hourAgo, 'loop'),
      this.repository.fillsSince(this.network, hourAgo, 'instant'),
      this.repository.control(this.network),
    ]);
    return {
      network: this.network,
      policy: this.policy,
      nowNs: BigInt(now.getTime()) * NS_PER_MS,
      pricesUsd,
      deskBalanceUsdc,
      exposureUsdc,
      lentTodayUsdc,
      fillsLastHour,
      instantFillsLastHour,
      pausedReason: control?.paused === true ? control.reason : null,
    };
  }

  /** Every open offer with the policy's verdict, read live from the registry. */
  async reviewOffers(): Promise<OfferReview[]> {
    const [offered, context] = await Promise.all([
      this.repository.offeredPacks(this.network),
      this.context(),
    ]);
    const live = await Promise.all(
      offered.map(async ({ packId, openedAtNs }) => ({
        offer: await this.chain.liveOffer(packId),
        openedAtNs,
      })),
    );
    return live.flatMap(({ offer, openedAtNs }) =>
      offer === null ? [] : [{ offer, openedAtNs, verdict: evaluate(offer, context) }],
    );
  }

  /** True while an offer is too new for the loop: the instant path gets the first look. */
  inHeadStart(review: OfferReview): boolean {
    if (review.openedAtNs === undefined || review.openedAtNs === null) return false;
    const ageNs = BigInt(this.now().getTime()) * NS_PER_MS - review.openedAtNs;
    return ageNs < BigInt(INSTANT_HEAD_START_MS) * NS_PER_MS;
  }

  async quote(pack: string): Promise<OfferReview | null> {
    const [offer, context] = await Promise.all([this.chain.liveOffer(pack), this.context()]);
    return offer === null ? null : { offer, verdict: evaluate(offer, context) };
  }

  /** The exact call an outside lender signs to fill `pack`, built from live chain data. */
  async prepareFill(pack: string): Promise<ContractCall | null> {
    const offer = await this.chain.liveOffer(pack);
    if (offer === null) return null;
    return this.fillCall(offer);
  }

  /** The offer on `pack` as the registry holds it now (never the indexer). */
  liveOffer(pack: string): Promise<OfferInput | null> {
    return this.chain.liveOffer(pack);
  }

  /** Runs `task` while no other fill can start. */
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    return this.fills.run(task);
  }

  /** Fills `pack` from the desk account when the policy allows it now; records the verdict. */
  fill(pack: string, runId: string, actor: string, why: string): Promise<FillResult> {
    return this.exclusive(async () => {
      const review = await this.quote(pack);
      if (review === null) {
        const reason = 'The pack is no longer offered.';
        await this.repository.record({
          network: this.network,
          runId,
          packId: pack,
          offerKey: null,
          verdict: 'refused',
          code: 'DESK_POLICY',
          reason,
          quote: null,
          txHash: null,
          actor,
        });
        return { status: 'refused', code: 'DESK_POLICY', reason };
      }
      return this.signChecked(review.offer, review.verdict, runId, actor, why);
    });
  }

  /**
   * Re-runs the policy on fresh data with `options` and signs when it passes. Callers hold the
   * fill lock.
   */
  async fillChecked(
    offer: OfferInput,
    options: EvaluateOptions,
    runId: string,
    actor: string,
    why: string,
  ): Promise<FillResult> {
    const verdict = evaluate(offer, await this.context(), options);
    return this.signChecked(offer, verdict, runId, actor, why);
  }

  private async signChecked(
    offer: OfferInput,
    verdict: Verdict,
    runId: string,
    actor: string,
    why: string,
  ): Promise<FillResult> {
    const base = {
      network: this.network,
      runId,
      packId: offer.pack,
      offerKey: offerKey(offer),
      actor,
      makerId: offer.makerId,
    };
    if (!verdict.ok) {
      await this.repository.record({
        ...base,
        verdict: 'refused',
        code: verdict.code,
        reason: verdict.reason,
        quote: verdict.quote,
        txHash: null,
      });
      return { status: 'refused', code: verdict.code, reason: verdict.reason };
    }
    try {
      const sent = await this.chain.send(this.fillCall(offer));
      const settled = sent.outcome.status === 'settled';
      await this.repository.record({
        ...base,
        verdict: settled ? 'fill' : 'error',
        code: settled ? null : (sent.outcome.code ?? 'E_STATE'),
        reason: settled ? why : 'The registry declined the fill; the USDC came back.',
        quote: verdict.quote,
        txHash: sent.hash,
      });
      return settled
        ? { status: 'filled', txHash: sent.hash, quote: verdict.quote }
        : {
            status: 'error',
            code: sent.outcome.code ?? 'E_STATE',
            reason: 'The registry declined the fill.',
            txHash: sent.hash,
          };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'The fill could not be sent.';
      await this.repository.record({
        ...base,
        verdict: 'error',
        code: 'UPSTREAM_RPC',
        reason,
        quote: verdict.quote,
        txHash: null,
      });
      return { status: 'error', code: 'UPSTREAM_RPC', reason };
    }
  }

  /**
   * Moves what the desk is owed out of its packs into its own verifier balance: repayments of
   * redeemed pawns and coins kept after a forfeit. Each pack is re-read on chain before signing;
   * one withdraw per token, in order, since a pack runs one command at a time. A paused desk
   * signs nothing, collects included.
   */
  async collect(): Promise<CollectResult[]> {
    const control = await this.repository.control(this.network);
    const paused = pauseReason({
      policy: this.policy,
      pausedReason: control?.paused === true ? control.reason : null,
    });
    if (paused !== null) return [];
    const calls = mosaecCalls(this.network);
    const packIds = await this.repository.collectablePacks(this.network, this.policy.deskAccountId);
    const results: CollectResult[] = [];
    for (const pack of packIds) {
      const lines = await this.chain.collectable(pack);
      if (lines === null) continue;
      for (const line of lines) {
        try {
          const sent = await this.chain.send(
            calls.withdraw({
              pack,
              tokenId: line.tokenId,
              amount: line.amount,
              destination: { kind: 'verifier', accountId: this.policy.deskAccountId },
            }),
          );
          results.push({
            pack,
            tokenId: line.tokenId,
            amount: line.amount,
            status: sent.outcome.status === 'settled' ? 'collected' : 'error',
            txHash: sent.hash,
          });
        } catch (cause) {
          results.push({
            pack,
            tokenId: line.tokenId,
            amount: line.amount,
            status: 'error',
            txHash: null,
            reason: cause instanceof Error ? cause.message : 'The withdraw could not be sent.',
          });
        }
      }
    }
    return results;
  }

  async recordPass(
    offer: OfferInput,
    runId: string,
    actor: string,
    why: string,
    quote: Quote | null,
  ) {
    await this.repository.record({
      network: this.network,
      runId,
      packId: offer.pack,
      offerKey: offerKey(offer),
      verdict: 'pass',
      code: null,
      reason: why,
      quote,
      txHash: null,
      actor,
      makerId: offer.makerId,
    });
  }

  /**
   * True when this offer already has a lasting verdict. Errors and budget or exposure refusals are
   * temporary, so those offers are looked at again on the next pass; a re-offer is a new offer.
   */
  async alreadyDecided(offer: OfferInput): Promise<boolean> {
    const last = await this.repository.lastDecision(this.network, offer.pack, offerKey(offer));
    if (last === null || last.verdict === 'error') return false;
    return !(
      last.verdict === 'refused' &&
      (last.code === 'DESK_BUDGET' || last.code === 'DESK_EXPOSURE' || last.code === 'DESK_PAUSED')
    );
  }

  async recordRefusal(offer: OfferInput, runId: string, verdict: Extract<Verdict, { ok: false }>) {
    await this.repository.record({
      network: this.network,
      runId,
      packId: offer.pack,
      offerKey: offerKey(offer),
      verdict: 'refused',
      code: verdict.code,
      reason: verdict.reason,
      quote: verdict.quote,
      txHash: null,
      actor: 'policy',
      makerId: offer.makerId,
    });
  }

  async recordAgentError(runId: string, actor: string, reason: string) {
    await this.repository.record({
      network: this.network,
      runId,
      packId: null,
      offerKey: null,
      verdict: 'error',
      code: 'DESK_AGENT',
      reason,
      quote: null,
      txHash: null,
      actor,
    });
  }

  private fillCall(offer: OfferInput): ContractCall {
    return mosaecCalls(this.network).fill({
      pack: offer.pack,
      terms: { kToken: offer.kToken, kAmount: offer.kAmount, termNs: offer.termNs },
      contentsHash: offer.contentsHash,
      payToken: offer.payToken,
      price: offer.price,
    });
  }
}
