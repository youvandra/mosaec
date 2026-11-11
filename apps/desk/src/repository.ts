import { and, count, desc, eq, gte, inArray, isNotNull, sum } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Quote } from './policy';
import type { Db } from '@mosaec/db';

const { deskDecisions, packs, prices } = schema;

export type DecisionVerdict = 'fill' | 'pass' | 'refused' | 'error';

export interface DecisionInput {
  readonly network: string;
  readonly runId: string;
  readonly packId: string | null;
  readonly offerKey: string | null;
  readonly verdict: DecisionVerdict;
  readonly code: string | null;
  readonly reason: string;
  readonly quote: Quote | null;
  readonly txHash: string | null;
  readonly actor: string;
}

/** The desk's reads of the indexer's tables and its own decision log. */
export class DeskRepository {
  constructor(private readonly db: Db) {}

  /** Packs the indexer currently sees as offered. */
  async offeredPacks(network: string): Promise<string[]> {
    const rows = await this.db
      .select({ packId: packs.packId })
      .from(packs)
      .where(and(eq(packs.network, network), eq(packs.state, 'offered')));
    return rows.map((row) => row.packId);
  }

  /** Free packs whose Title the desk holds and that still list contents (repayments or kept coins). */
  async collectablePacks(network: string, deskAccountId: string): Promise<string[]> {
    const rows = await this.db
      .select({ packId: packs.packId })
      .from(packs)
      .where(
        and(
          eq(packs.network, network),
          eq(packs.state, 'free'),
          eq(packs.titleOwner, deskAccountId),
          isNotNull(packs.contents),
        ),
      );
    return rows.map((row) => row.packId);
  }

  /**
   * Principal still out: for each pack running with the desk holding the Title, the principal of
   * the desk's latest fill on it. Earlier rounds of the same pack were repaid or kept already.
   */
  async exposure(network: string, deskAccountId: string): Promise<bigint> {
    const running = this.db
      .select({ packId: packs.packId })
      .from(packs)
      .where(
        and(
          eq(packs.network, network),
          eq(packs.state, 'written'),
          eq(packs.titleOwner, deskAccountId),
        ),
      );
    const rows = await this.db
      .selectDistinctOn([deskDecisions.packId], { principal: deskDecisions.principal })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.verdict, 'fill'),
          inArray(deskDecisions.packId, running),
        ),
      )
      .orderBy(deskDecisions.packId, desc(deskDecisions.decidedAt));
    return rows.reduce((total, row) => total + BigInt(row.principal ?? '0'), 0n);
  }

  async lentSince(network: string, since: Date): Promise<bigint> {
    const [row] = await this.db
      .select({ total: sum(deskDecisions.principal) })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.verdict, 'fill'),
          gte(deskDecisions.decidedAt, since),
        ),
      );
    return BigInt(row?.total ?? '0');
  }

  async fillsSince(network: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.verdict, 'fill'),
          gte(deskDecisions.decidedAt, since),
        ),
      );
    return row?.n ?? 0;
  }

  /** The latest decision on one offer of `packId`, so a settled verdict is not re-asked every loop. */
  async lastDecision(
    network: string,
    packId: string,
    offerKey: string,
  ): Promise<{ verdict: DecisionVerdict; code: string | null } | null> {
    const [row] = await this.db
      .select({ verdict: deskDecisions.verdict, code: deskDecisions.code })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.packId, packId),
          eq(deskDecisions.offerKey, offerKey),
        ),
      )
      .orderBy(desc(deskDecisions.decidedAt))
      .limit(1);
    return row ?? null;
  }

  async record(input: DecisionInput): Promise<void> {
    await this.db.insert(deskDecisions).values({
      network: input.network,
      runId: input.runId,
      packId: input.packId,
      offerKey: input.offerKey,
      verdict: input.verdict,
      code: input.code,
      reason: input.reason,
      quote: input.quote,
      principal: input.verdict === 'fill' ? (input.quote?.principal ?? null) : null,
      txHash: input.txHash,
      actor: input.actor,
    });
  }

  async savePrices(observed: Readonly<Record<string, number>>, source: string): Promise<void> {
    const at = new Date();
    const rows = Object.entries(observed).map(([symbol, usd]) => ({
      symbol,
      usd: usd.toString(),
      source,
      observedAt: at,
    }));
    if (rows.length > 0) await this.db.insert(prices).values(rows).onConflictDoNothing();
  }
}

/** 00:00 UTC of the day `now` falls in. */
export function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
