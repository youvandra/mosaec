import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Db } from '@mosaec/db';

const { deskControls, deskDecisions, deskRateCards, events, prices } = schema;

/** Events that close a pawn, with the outcome each gives the loan. */
const CLOSING_EVENTS = { contents_released: 'Redeemed', expired: 'Forfeited' } as const;
const NS_PER_MS = 1_000_000n;

export type FillOutcome = 'running' | 'Redeemed' | 'Forfeited';

export interface ClosingEvent {
  readonly packId: string;
  readonly atNs: bigint;
  readonly outcome: Exclude<FillOutcome, 'running'>;
}

export type DecisionRecord = typeof deskDecisions.$inferSelect;
export type PriceRecord = typeof prices.$inferSelect;
export type RateCardRecord = typeof deskRateCards.$inferSelect;
export type ControlRecord = typeof deskControls.$inferSelect;

export interface DeskFillRow {
  readonly packId: string;
  readonly decidedAt: Date;
  readonly txHash: string | null;
  readonly actor: string;
  readonly principal: string;
  readonly interest: string;
  /** The coins the fill lent against, as the quote recorded them. */
  readonly collateral: { readonly symbol: string; readonly amount: string } | null;
  /** How this fill's round ended: the first closing event on its pack after the fill. */
  readonly outcome: FillOutcome;
}

/**
 * The outcome of a fill made at `decidedAt` on a pack: the first closing event after it. A pack
 * can be pawned again, so a later round never rewrites an earlier fill.
 */
export function settleFill(decidedAt: Date, closings: readonly ClosingEvent[]): FillOutcome {
  const fromNs = BigInt(decidedAt.getTime()) * NS_PER_MS;
  let first: ClosingEvent | null = null;
  for (const event of closings) {
    if (event.atNs > fromNs && (first === null || event.atNs < first.atNs)) first = event;
  }
  return first?.outcome ?? 'running';
}

/** Read-only access to the desk's decision log and the packs it lent on. */
export class DeskRepository {
  constructor(private readonly db: Db) {}

  /** The desk's verdicts on offers, newest first; collects live in the ledger instead. */
  async decisions(network: string, limit: number): Promise<DecisionRecord[]> {
    return this.db
      .select()
      .from(deskDecisions)
      .where(and(eq(deskDecisions.network, network), ne(deskDecisions.verdict, 'collect')))
      .orderBy(desc(deskDecisions.decidedAt))
      .limit(limit);
  }

  /** Every desk fill with the outcome of its own round. */
  async fills(network: string): Promise<DeskFillRow[]> {
    const rows = await this.db
      .select()
      .from(deskDecisions)
      .where(and(eq(deskDecisions.network, network), eq(deskDecisions.verdict, 'fill')));
    const ids = [...new Set(rows.flatMap((row) => (row.packId === null ? [] : [row.packId])))];
    const closings = await this.closings(network, ids);
    return rows.map((row) => {
      const quote = (row.quote ?? {}) as {
        interest?: string;
        collateral?: { symbol: string; amount: string };
      };
      return {
        packId: row.packId ?? '',
        decidedAt: row.decidedAt,
        txHash: row.txHash,
        actor: row.actor,
        collateral: quote.collateral ?? null,
        principal: row.principal ?? '0',
        interest: quote.interest ?? '0',
        outcome: settleFill(row.decidedAt, closings.get(row.packId ?? '') ?? []),
      };
    });
  }

  /** Closing events on `packIds`, grouped by pack. */
  private async closings(
    network: string,
    packIds: readonly string[],
  ): Promise<Map<string, ClosingEvent[]>> {
    const grouped = new Map<string, ClosingEvent[]>();
    if (packIds.length === 0) return grouped;
    const rows = await this.db
      .select({ packId: events.packId, atNs: events.blockTimestampNs, event: events.event })
      .from(events)
      .where(
        and(
          eq(events.network, network),
          eq(events.standard, 'mosaec'),
          inArray(events.packId, [...packIds]),
          inArray(events.event, Object.keys(CLOSING_EVENTS)),
        ),
      );
    for (const row of rows) {
      if (row.packId === null) continue;
      const list = grouped.get(row.packId) ?? [];
      list.push({
        packId: row.packId,
        atNs: BigInt(row.atNs),
        outcome: CLOSING_EVENTS[row.event as keyof typeof CLOSING_EVENTS],
      });
      grouped.set(row.packId, list);
    }
    return grouped;
  }

  /** Withdraws the desk made out of its packs since `since`. */
  async collects(network: string, since: Date): Promise<DecisionRecord[]> {
    return this.db
      .select()
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.verdict, 'collect'),
          gte(deskDecisions.decidedAt, since),
        ),
      )
      .orderBy(desc(deskDecisions.decidedAt));
  }

  /** Rate cards written since `since`, newest first. */
  async rateCards(network: string, since: Date): Promise<RateCardRecord[]> {
    return this.db
      .select()
      .from(deskRateCards)
      .where(and(eq(deskRateCards.network, network), gte(deskRateCards.createdAt, since)))
      .orderBy(desc(deskRateCards.createdAt), desc(deskRateCards.id));
  }

  /** The newest card per coin, however old. */
  async latestCards(network: string): Promise<RateCardRecord[]> {
    return this.db
      .selectDistinctOn([deskRateCards.asset])
      .from(deskRateCards)
      .where(eq(deskRateCards.network, network))
      .orderBy(deskRateCards.asset, desc(deskRateCards.createdAt), desc(deskRateCards.id));
  }

  async control(network: string): Promise<ControlRecord | null> {
    const [row] = await this.db
      .select()
      .from(deskControls)
      .where(eq(deskControls.network, network))
      .limit(1);
    return row ?? null;
  }

  /** The latest reference price of each symbol. */
  async latestPrices(): Promise<PriceRecord[]> {
    return this.db
      .selectDistinctOn([prices.symbol])
      .from(prices)
      .orderBy(prices.symbol, desc(prices.observedAt));
  }
}
