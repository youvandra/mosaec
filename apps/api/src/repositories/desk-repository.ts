import { and, desc, eq, inArray } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Db } from '@mosaec/db';

const { deskDecisions, packs, prices } = schema;

export type DecisionRecord = typeof deskDecisions.$inferSelect;
export type PriceRecord = typeof prices.$inferSelect;

export interface DeskFillRow {
  readonly packId: string;
  readonly principal: string;
  readonly interest: string;
  readonly state: 'free' | 'offered' | 'written' | null;
  readonly titleOwner: string | null;
  readonly lastOutcome: 'Redeemed' | 'Forfeited' | null;
}

/** Read-only access to the desk's decision log and the packs it lent on. */
export class DeskRepository {
  constructor(private readonly db: Db) {}

  async decisions(network: string, limit: number): Promise<DecisionRecord[]> {
    return this.db
      .select()
      .from(deskDecisions)
      .where(eq(deskDecisions.network, network))
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
      const quote = (row.quote ?? {}) as { interest?: string };
      const pack = row.packId === null ? undefined : byId.get(row.packId);
      return {
        packId: row.packId ?? '',
        principal: row.principal ?? '0',
        interest: quote.interest ?? '0',
        state: pack?.state ?? null,
        titleOwner: pack?.titleOwner ?? null,
        lastOutcome: pack?.lastOutcome ?? null,
      };
    });
  }

  /** The latest reference price of each symbol. */
  async latestPrices(): Promise<PriceRecord[]> {
    return this.db
      .selectDistinctOn([prices.symbol])
      .from(prices)
      .orderBy(prices.symbol, desc(prices.observedAt));
  }
}
