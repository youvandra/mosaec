import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Db } from '@mosaec/db';

const { deskControls, deskDecisions, deskRateCards, packs, prices } = schema;

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
  readonly state: 'free' | 'offered' | 'written' | null;
  readonly titleOwner: string | null;
  readonly lastOutcome: 'Redeemed' | 'Forfeited' | null;
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

  /** Every desk fill with the current state of its pack. */
  async fills(network: string): Promise<DeskFillRow[]> {
    const rows = await this.db
      .select()
      .from(deskDecisions)
      .where(and(eq(deskDecisions.network, network), eq(deskDecisions.verdict, 'fill')));
    const ids = rows.map((row) => row.packId).filter((id): id is string => id !== null);
    const states =
      ids.length === 0
        ? []
        : await this.db
            .select()
            .from(packs)
            .where(and(eq(packs.network, network), inArray(packs.packId, ids)));
    const byId = new Map(states.map((pack) => [pack.packId, pack]));
    return rows.map((row) => {
      const quote = (row.quote ?? {}) as {
        interest?: string;
        collateral?: { symbol: string; amount: string };
      };
      const pack = row.packId === null ? undefined : byId.get(row.packId);
      return {
        packId: row.packId ?? '',
        decidedAt: row.decidedAt,
        txHash: row.txHash,
        actor: row.actor,
        collateral: quote.collateral ?? null,
        principal: row.principal ?? '0',
        interest: quote.interest ?? '0',
        state: pack?.state ?? null,
        titleOwner: pack?.titleOwner ?? null,
        lastOutcome: pack?.lastOutcome ?? null,
      };
    });
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
