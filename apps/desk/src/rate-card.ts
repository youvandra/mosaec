import { z } from 'zod';

import { FAIR_MONTHLY_RATE_BPS, rateBounds } from '@mosaec/config/rates';

import type { DeskService } from './desk-service';
import type { ChatModel } from './model';
import type { DeskSymbol } from './prices';
import type { DeskRepository, RateCard } from './repository';
import type { RealisedVolatility } from './volatility';
import type { RateBounds } from '@mosaec/config/rates';

/** How often the agent sets a new card. */
export const CARD_INTERVAL_MS = 3_600_000;
/** Largest move of a card's rate from the previous card, per refresh. */
export const CARD_STEP_BPS = 50;
/** The agent may tighten loan to value down to this, never loosen it past the policy. */
export const MIN_CARD_LTV_BPS = 2_000;
const MAX_REASON = 280;
const BPS = 10_000n;

/* Kept short: a small model on a CPU host reads every token of it each hour. */
const SYSTEM = `You set the monthly rate card of a USDC lending desk that lends against sealed coins with no liquidation; on a missed date it keeps the coins. Raise the rate when volatility, utilisation or forfeits rise; lower it toward the floor when calm. Tighten max_ltv_bps when volatility is high. Stay inside min and max. Write one card for every asset in the inputs. Reply with JSON only: {"cards":[{"asset":"<asset>","monthly_bps":<number>,"max_ltv_bps":<number>,"reason":"one short sentence"}]}`;

const proposalSchema = z.object({
  cards: z.array(
    z.object({
      asset: z.string(),
      monthly_bps: z.number(),
      max_ltv_bps: z.number(),
      reason: z.string(),
    }),
  ),
});

export interface CardProposal {
  readonly monthlyBps: number;
  readonly maxLtvBps: number;
  readonly reason: string;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * The card the server writes for a proposal: at most one step from the previous card, then held
 * inside the shared bounds, which always win, so a card never sits below fair rate plus margin.
 */
export function clampCard(
  proposal: Pick<CardProposal, 'monthlyBps' | 'maxLtvBps'>,
  previous: Pick<RateCard, 'monthlyBps'> | null,
  bounds: RateBounds,
  policyMaxLtvBps: number,
): { monthlyBps: number; maxLtvBps: number } {
  let monthlyBps = Math.round(proposal.monthlyBps);
  if (previous !== null) {
    monthlyBps = clamp(
      monthlyBps,
      previous.monthlyBps - CARD_STEP_BPS,
      previous.monthlyBps + CARD_STEP_BPS,
    );
  }
  return {
    monthlyBps: clamp(monthlyBps, bounds.minMonthlyBps, bounds.maxMonthlyBps),
    maxLtvBps: clamp(Math.round(proposal.maxLtvBps), MIN_CARD_LTV_BPS, policyMaxLtvBps),
  };
}

/** Reads the model's reply; anything that is not the expected JSON yields no proposals. */
export function parseProposals(reply: string | null): Map<string, CardProposal> {
  const proposals = new Map<string, CardProposal>();
  if (reply === null) return proposals;
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return proposals;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return proposals;
  }
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) return proposals;
  for (const card of parsed.data.cards) {
    proposals.set(card.asset.toUpperCase(), {
      monthlyBps: card.monthly_bps,
      maxLtvBps: card.max_ltv_bps,
      reason: card.reason.trim().slice(0, MAX_REASON),
    });
  }
  return proposals;
}

/**
 * Sets the rate card the instant desk quotes from. The model proposes per coin from live inputs;
 * the server clamps every proposal and writes the fallback card (fair rate plus margin) for any
 * coin the model failed to price.
 */
export class RateCards {
  constructor(
    private readonly desk: DeskService,
    private readonly repository: DeskRepository,
    private readonly volatility: RealisedVolatility,
    private readonly model: ChatModel,
  ) {}

  /** The card to quote `asset` from; writes the fallback card when none exists yet. */
  async current(asset: DeskSymbol): Promise<RateCard> {
    const latest = await this.repository.latestCard(this.desk.network, asset);
    if (latest !== null) return latest;
    return this.saveFallback(asset, {}, 'No card yet; fair rate plus margin.');
  }

  /** One hourly pass: a new card per desk coin. */
  async refresh(): Promise<RateCard[]> {
    const { network, policy } = this.desk;
    const [context, book] = await Promise.all([
      this.desk.context(),
      this.repository.bookCounts(network, policy.deskAccountId),
    ]);
    const utilisationBps =
      policy.maxExposureUsdc === 0n
        ? 0
        : Number((context.exposureUsdc * BPS) / policy.maxExposureUsdc);
    const budgetLeft = policy.dailyBudgetUsdc - context.lentTodayUsdc;
    const inputs = new Map<DeskSymbol, Record<string, unknown>>();
    const previous = new Map<DeskSymbol, RateCard | null>();
    for (const asset of policy.assets) {
      const [vol, card] = await Promise.all([
        this.volatility.of(asset),
        this.repository.latestCard(network, asset),
      ]);
      const bounds = rateBounds(asset);
      previous.set(asset, card);
      inputs.set(asset, {
        asset,
        fair_monthly_bps: FAIR_MONTHLY_RATE_BPS[asset],
        min_monthly_bps: bounds.minMonthlyBps,
        max_monthly_bps: bounds.maxMonthlyBps,
        max_ltv_bps_allowed: policy.maxLtvBps,
        realised_vol_30d_bps: vol,
        utilisation_bps: utilisationBps,
        exposure_usdc_units: context.exposureUsdc.toString(),
        budget_left_today_usdc_units: (budgetLeft > 0n ? budgetLeft : 0n).toString(),
        repaid_pawns: book.repaid,
        forfeited_pawns: book.forfeited,
        previous_card:
          card === null ? null : { monthly_bps: card.monthlyBps, max_ltv_bps: card.maxLtvBps },
      });
    }

    const proposals = await this.ask([...inputs.values()]);
    /*
     * A small model often answers only the first coin. When it answered at all, ask again for
     * each skipped coin on its own, one call at a time so the CPU host is never asked twice at once.
     */
    if (proposals.size > 0) {
      for (const asset of policy.assets) {
        if (proposals.has(asset)) continue;
        const retry = await this.ask([inputs.get(asset) ?? { asset }]);
        const proposal = retry.get(asset);
        if (proposal !== undefined) proposals.set(asset, proposal);
      }
    }
    const cards: RateCard[] = [];
    for (const asset of policy.assets) {
      const input = inputs.get(asset) ?? {};
      const proposal = proposals.get(asset);
      if (proposal === undefined) {
        cards.push(
          await this.saveFallback(asset, input, 'Model gave no card; fair rate plus margin.'),
        );
        continue;
      }
      const card = clampCard(
        proposal,
        previous.get(asset) ?? null,
        rateBounds(asset),
        policy.maxLtvBps,
      );
      cards.push(
        await this.repository.saveCard({
          network,
          asset,
          ...card,
          inputs: {
            ...input,
            proposed: { monthly_bps: proposal.monthlyBps, max_ltv_bps: proposal.maxLtvBps },
          },
          reason: proposal.reason === '' ? 'No reason given.' : proposal.reason,
          source: 'model',
        }),
      );
    }
    return cards;
  }

  private async ask(
    inputs: readonly Record<string, unknown>[],
  ): Promise<Map<string, CardProposal>> {
    try {
      const reply = await this.model.complete(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Inputs: ${JSON.stringify(inputs)}` },
        ],
        [],
        { json: true },
      );
      return parseProposals(reply.role === 'assistant' ? reply.content : null);
    } catch {
      return new Map();
    }
  }

  private saveFallback(
    asset: DeskSymbol,
    inputs: Record<string, unknown>,
    reason: string,
  ): Promise<RateCard> {
    return this.repository.saveCard({
      network: this.desk.network,
      asset,
      monthlyBps: rateBounds(asset).minMonthlyBps,
      maxLtvBps: this.desk.policy.maxLtvBps,
      inputs,
      reason,
      source: 'fallback',
    });
  }
}
