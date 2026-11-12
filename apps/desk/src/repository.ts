import { and, count, desc, eq, gte, inArray, isNotNull, ne, sum } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Quote } from './policy';
import type { Db } from '@mosaec/db';

const { deskControls, deskDecisions, deskRateCards, events, offers, packs, prices } = schema;

export type DecisionVerdict = 'fill' | 'pass' | 'refused' | 'error';

/** Actor recorded on fills made through an instant quote. */
export const INSTANT_ACTOR = 'instant';

/** Which hourly quota a fill counts against. */
export type FillLane = 'loop' | 'instant';

export interface DeskControl {
  readonly paused: boolean;
  readonly reason: string;
  readonly updatedAt: Date;
}

export interface RateCard {
  readonly id: string;
  readonly asset: string;
  readonly monthlyBps: number;
  readonly maxLtvBps: number;
  readonly reason: string;
  readonly source: 'model' | 'fallback';
  readonly createdAt: Date;
}

export interface RateCardInput {
  readonly network: string;
  readonly asset: string;
  readonly monthlyBps: number;
  readonly maxLtvBps: number;
  readonly inputs: Record<string, unknown>;
  readonly reason: string;
  readonly source: 'model' | 'fallback';
}

export interface OfferedPack {
  readonly packId: string;
  /** Block time of the receipt that opened the current offer; null before the indexer has it. */
  readonly openedAtNs: bigint | null;
}

export interface BookCounts {
  readonly repaid: number;
  readonly forfeited: number;
}

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
  readonly makerId?: string | null;
}

/** The desk's reads of the indexer's tables and its own decision log. */
export class DeskRepository {
  constructor(private readonly db: Db) {}

  /** Packs the indexer currently sees as offered, with when their open offer was made. */
  async offeredPacks(network: string): Promise<OfferedPack[]> {
    const rows = await this.db
      .select({ packId: packs.packId, openedAtNs: events.blockTimestampNs })
      .from(packs)
      .leftJoin(
        offers,
        and(
          eq(offers.network, packs.network),
          eq(offers.packId, packs.packId),
          eq(offers.status, 'open'),
        ),
      )
      .leftJoin(events, eq(events.receiptId, offers.receiptId))
      .where(and(eq(packs.network, network), eq(packs.state, 'offered')));
    const opened = new Map<string, bigint | null>();
    for (const row of rows) {
      const at = row.openedAtNs === null ? null : BigInt(row.openedAtNs);
      const seen = opened.get(row.packId);
      if (seen === undefined || (at !== null && (seen === null || at > seen))) {
        opened.set(row.packId, at);
      }
    }
    return [...opened].map(([packId, openedAtNs]) => ({ packId, openedAtNs }));
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

  /** Fills since `since` in one quota lane: instant quotes, or everything else. */
  async fillsSince(network: string, since: Date, lane: FillLane): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.verdict, 'fill'),
          gte(deskDecisions.decidedAt, since),
          lane === 'instant'
            ? eq(deskDecisions.actor, INSTANT_ACTOR)
            : ne(deskDecisions.actor, INSTANT_ACTOR),
        ),
      );
    return row?.n ?? 0;
  }

  /** True while `makerId` has an instant desk loan still running. */
  async hasOpenInstantLoan(
    network: string,
    deskAccountId: string,
    makerId: string,
  ): Promise<boolean> {
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
    const [row] = await this.db
      .select({ n: count() })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.verdict, 'fill'),
          eq(deskDecisions.actor, INSTANT_ACTOR),
          eq(deskDecisions.makerId, makerId),
          inArray(deskDecisions.packId, running),
        ),
      );
    return (row?.n ?? 0) > 0;
  }

  /** The latest instant fill on `packId` since `since`, so a retried call returns it. */
  async instantFillSince(
    network: string,
    packId: string,
    since: Date,
  ): Promise<{ txHash: string; quote: Quote } | null> {
    const [row] = await this.db
      .select({ txHash: deskDecisions.txHash, quote: deskDecisions.quote })
      .from(deskDecisions)
      .where(
        and(
          eq(deskDecisions.network, network),
          eq(deskDecisions.packId, packId),
          eq(deskDecisions.verdict, 'fill'),
          eq(deskDecisions.actor, INSTANT_ACTOR),
          gte(deskDecisions.decidedAt, since),
        ),
      )
      .orderBy(desc(deskDecisions.decidedAt))
      .limit(1);
    if (row?.txHash == null || row.quote === null) return null;
    return { txHash: row.txHash, quote: row.quote as Quote };
  }

  /** Outcomes of pawns the desk lent on, for the rate card's inputs. */
  async bookCounts(network: string, deskAccountId: string): Promise<BookCounts> {
    const rows = await this.db
      .select({ outcome: packs.lastOutcome, n: count() })
      .from(packs)
      .where(
        and(
          eq(packs.network, network),
          eq(packs.titleOwner, deskAccountId),
          isNotNull(packs.lastOutcome),
        ),
      )
      .groupBy(packs.lastOutcome);
    const of = (outcome: string) => rows.find((row) => row.outcome === outcome)?.n ?? 0;
    return { repaid: of('Redeemed'), forfeited: of('Forfeited') };
  }

  async control(network: string): Promise<DeskControl | null> {
    const [row] = await this.db
      .select({
        paused: deskControls.paused,
        reason: deskControls.reason,
        updatedAt: deskControls.updatedAt,
      })
      .from(deskControls)
      .where(eq(deskControls.network, network))
      .limit(1);
    return row ?? null;
  }

  async setControl(network: string, paused: boolean, reason: string): Promise<DeskControl> {
    const updatedAt = new Date();
    await this.db
      .insert(deskControls)
      .values({ network, paused, reason, updatedAt })
      .onConflictDoUpdate({ target: deskControls.network, set: { paused, reason, updatedAt } });
    return { paused, reason, updatedAt };
  }

  async latestCard(network: string, asset: string): Promise<RateCard | null> {
    const [row] = await this.db
      .select()
      .from(deskRateCards)
      .where(and(eq(deskRateCards.network, network), eq(deskRateCards.asset, asset)))
      .orderBy(desc(deskRateCards.createdAt), desc(deskRateCards.id))
      .limit(1);
    return row === undefined ? null : toCard(row);
  }

  async saveCard(input: RateCardInput): Promise<RateCard> {
    const [row] = await this.db.insert(deskRateCards).values(input).returning();
    if (row === undefined) throw new Error('the rate card was not stored');
    return toCard(row);
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
      makerId: input.makerId ?? null,
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

function toCard(row: typeof deskRateCards.$inferSelect): RateCard {
  return {
    id: row.id.toString(),
    asset: row.asset,
    monthlyBps: row.monthlyBps,
    maxLtvBps: row.maxLtvBps,
    reason: row.reason,
    source: row.source,
    createdAt: row.createdAt,
  };
}

/** 00:00 UTC of the day `now` falls in. */
export function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
