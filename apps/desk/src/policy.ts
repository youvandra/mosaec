import { ASSETS, assetByTokenId } from '@mosaec/config/assets';
import { isDeskAsset } from '@mosaec/config/desk';
import { aprBps } from '@mosaec/sdk';

import type { NetworkId } from '@mosaec/config/assets';
import type { DeskPolicy } from '@mosaec/config/desk';
import type { ErrorCode } from '@mosaec/domain';

const BPS = 10_000n;
const USD_SCALE = 1_000_000n;

/** An open offer as the chain reports it at decision time. */
export interface OfferInput {
  readonly pack: string;
  readonly makerId: string;
  readonly payToken: string;
  readonly price: bigint;
  readonly kToken: string;
  readonly kAmount: bigint;
  readonly termNs: bigint;
  readonly openUntilNs: bigint;
  readonly contents: readonly { readonly tokenId: string; readonly amount: bigint }[];
  readonly contentsHash: string;
  /** Holder of the pack's Title, when the read included it. */
  readonly titleOwner?: string | null;
}

/**
 * Identity of one offer on a pack. A pack is reused (cancel and re-offer, or a new round after a
 * redeem), so a verdict holds for this key only.
 */
export function offerKey(offer: OfferInput): string {
  return [
    offer.contentsHash,
    offer.openUntilNs.toString(),
    offer.price.toString(),
    offer.kAmount.toString(),
    offer.termNs.toString(),
  ].join(':');
}

/** What the desk already holds and has done, read fresh before every verdict. */
export interface DeskContext {
  readonly network: NetworkId;
  readonly policy: DeskPolicy;
  readonly nowNs: bigint;
  /** USD per whole coin, from the reference source; absent when the source failed. */
  readonly pricesUsd: Readonly<Partial<Record<'ZEC' | 'BTC' | 'SOL', number>>>;
  readonly deskBalanceUsdc: bigint;
  /** Principal of every running desk pawn. */
  readonly exposureUsdc: bigint;
  /** Principal lent since 00:00 UTC. */
  readonly lentTodayUsdc: bigint;
  /** Fills by the agent loop and the MCP tool in the last hour. */
  readonly fillsLastHour: number;
  /** Instant desk loans in the last hour; a separate quota. */
  readonly instantFillsLastHour: number;
  /** Why the kill switch holds the desk, or null when it is off. */
  readonly pausedReason: string | null;
}

export interface EvaluateOptions {
  /** Which hourly quota the fill counts against. */
  readonly lane: 'loop' | 'instant';
  /**
   * Skip the reference-price loan-to-value check: an unexpired instant quote already priced the
   * coins, and the desk honours its promise while the quote stands.
   */
  readonly honourQuotedLtv?: boolean;
}

const LOOP: EvaluateOptions = { lane: 'loop' };

/** Why the desk is paused right now, or null. The config flag is a floor the switch cannot lift. */
export function pauseReason(ctx: Pick<DeskContext, 'policy' | 'pausedReason'>): string | null {
  if (ctx.policy.paused) return 'The desk is paused by the team.';
  return ctx.pausedReason === null ? null : `The desk is paused: ${ctx.pausedReason}`;
}

export interface Quote {
  readonly pack: string;
  readonly collateral: { readonly symbol: string; readonly amount: string };
  readonly collateralUsd: string;
  readonly principal: string;
  readonly repayment: string;
  readonly interest: string;
  readonly termNs: string;
  readonly aprBps: number;
  readonly ltvBps: number;
}

export type Verdict =
  | { readonly ok: true; readonly quote: Quote }
  | {
      readonly ok: false;
      readonly code: Extract<ErrorCode, `DESK_${string}`>;
      readonly reason: string;
      readonly quote: Quote | null;
    };

function usdc(amount: bigint): string {
  const whole = amount / USD_SCALE;
  const cents = (amount % USD_SCALE) / 10_000n;
  return `${whole.toString()}.${cents.toString().padStart(2, '0')} USDC`;
}

function pct(bps: bigint | number): string {
  return `${(Number(bps) / 100).toFixed(1)}%`;
}

/** USDC value (smallest unit) of `amount` of a coin with `decimals`, at `usd` per coin. */
export function collateralValueUsdc(amount: bigint, decimals: number, usd: number): bigint {
  const usdMicro = BigInt(Math.round(usd * 1_000_000));
  return (amount * usdMicro) / 10n ** BigInt(decimals);
}

/**
 * Checks one offer against the desk policy and the desk's current book. Pure: the same inputs
 * always give the same verdict, so the agent, the MCP tools and the tests share one rule set.
 */
export function evaluate(
  offer: OfferInput,
  ctx: DeskContext,
  options: EvaluateOptions = LOOP,
): Verdict {
  const { policy } = ctx;
  const usdcId = ASSETS.USDC.tokenIds[ctx.network];
  const refuse = (
    code: Extract<ErrorCode, `DESK_${string}`>,
    reason: string,
    quote: Quote | null = null,
  ): Verdict => ({ ok: false, code, reason, quote });

  const paused = pauseReason(ctx);
  if (paused !== null) return refuse('DESK_PAUSED', paused);
  if (offer.makerId === policy.deskAccountId) {
    return refuse('DESK_POLICY', 'The desk never fills its own offer.');
  }
  if (offer.payToken !== usdcId || offer.kToken !== usdcId) {
    return refuse('DESK_POLICY', 'The desk lends and collects in USDC only.');
  }
  if (offer.contents.length !== 1) {
    return refuse('DESK_POLICY', 'The desk takes packs holding exactly one coin.');
  }
  const line = offer.contents[0];
  const asset = line === undefined ? undefined : assetByTokenId(ctx.network, line.tokenId);
  if (line === undefined || asset === undefined || !isDeskAsset(asset.symbol)) {
    return refuse('DESK_POLICY', 'The pack holds a coin the desk does not take.');
  }
  if (!policy.assets.includes(asset.symbol)) {
    return refuse('DESK_POLICY', `${asset.symbol} is outside the desk policy.`);
  }

  const usd = ctx.pricesUsd[asset.symbol];
  const collateralUsd =
    usd === undefined ? 0n : collateralValueUsdc(line.amount, asset.decimals, usd);
  const apr =
    offer.price > 0n && offer.kAmount >= offer.price && offer.termNs > 0n
      ? aprBps(offer.price, offer.kAmount, offer.termNs)
      : 0n;
  const ltv = collateralUsd === 0n ? BPS * 100n : (offer.price * BPS) / collateralUsd;
  const quote: Quote = {
    pack: offer.pack,
    collateral: { symbol: asset.symbol, amount: line.amount.toString() },
    collateralUsd: collateralUsd.toString(),
    principal: offer.price.toString(),
    repayment: offer.kAmount.toString(),
    interest: (offer.kAmount - offer.price).toString(),
    termNs: offer.termNs.toString(),
    aprBps: Number(apr),
    ltvBps: Number(ltv),
  };

  if (offer.openUntilNs <= ctx.nowNs) return refuse('DESK_POLICY', 'The offer has closed.', quote);
  if (offer.termNs < policy.minTermNs || offer.termNs > policy.maxTermNs) {
    return refuse('DESK_POLICY', 'The term sits outside the desk range.', quote);
  }
  if (offer.kAmount <= offer.price) {
    return refuse('DESK_POLICY', 'The repayment pays no interest.', quote);
  }
  const minApr = policy.minAprBpsByAsset[asset.symbol];
  if (apr < BigInt(minApr)) {
    return refuse(
      'DESK_POLICY',
      `The rate is ${pct(apr)} a year; the desk asks at least ${pct(minApr)} for ${asset.symbol}.`,
      quote,
    );
  }
  if (usd === undefined && options.honourQuotedLtv !== true) {
    return refuse('DESK_POLICY', `No reference price for ${asset.symbol} right now.`, quote);
  }
  if (ltv > BigInt(policy.maxLtvBps) && options.honourQuotedLtv !== true) {
    return refuse(
      'DESK_POLICY',
      `The loan is ${pct(ltv)} of the coins' value; the desk lends at most ${pct(policy.maxLtvBps)}.`,
      quote,
    );
  }
  if (offer.price < policy.minFillUsdc) {
    return refuse(
      'DESK_POLICY',
      `The desk lends at least ${usdc(policy.minFillUsdc)} per pawn.`,
      quote,
    );
  }
  if (offer.price > policy.maxFillUsdc) {
    return refuse(
      'DESK_POLICY',
      `The desk lends at most ${usdc(policy.maxFillUsdc)} per pawn.`,
      quote,
    );
  }
  if (offer.price > ctx.deskBalanceUsdc) {
    return refuse('DESK_BUDGET', 'The desk balance is below this loan.', quote);
  }
  if (ctx.lentTodayUsdc + offer.price > policy.dailyBudgetUsdc) {
    return refuse(
      'DESK_BUDGET',
      `Today's budget of ${usdc(policy.dailyBudgetUsdc)} is spent.`,
      quote,
    );
  }
  const [made, quota] =
    options.lane === 'instant'
      ? [ctx.instantFillsLastHour, policy.maxInstantFillsPerHour]
      : [ctx.fillsLastHour, policy.maxFillsPerHour];
  if (made >= quota) {
    return refuse('DESK_BUDGET', 'The desk has made its fills for this hour.', quote);
  }
  if (ctx.exposureUsdc + offer.price > policy.maxExposureUsdc) {
    return refuse(
      'DESK_EXPOSURE',
      `This loan would take the desk past ${usdc(policy.maxExposureUsdc)} out at once.`,
      quote,
    );
  }
  return { ok: true, quote };
}
