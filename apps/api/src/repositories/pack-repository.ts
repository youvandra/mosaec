import { and, asc, desc, eq, gt, or } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Db } from '@mosaec/db';

const { checkpoints, events, packs } = schema;

export type PackRecord = typeof packs.$inferSelect;
export type EventRecord = typeof events.$inferSelect;
export type CheckpointRecord = typeof checkpoints.$inferSelect;

export interface PackFilter {
  readonly network: string;
  readonly state?: PackRecord['state'];
  readonly owner?: string;
  readonly limit: number;
  /** Pack index to continue after, from the previous page. */
  readonly afterIndex?: bigint;
}

/** Read-only access to the indexer's tables. */
export class PackRepository {
  constructor(private readonly db: Db) {}

  async list(filter: PackFilter): Promise<PackRecord[]> {
    const conditions = [eq(packs.network, filter.network)];
    if (filter.state !== undefined) {
      conditions.push(eq(packs.state, filter.state));
    }
    if (filter.owner !== undefined) {
      const byOwner = or(eq(packs.titleOwner, filter.owner), eq(packs.ticketOwner, filter.owner));
      if (byOwner !== undefined) {
        conditions.push(byOwner);
      }
    }
    if (filter.afterIndex !== undefined) {
      conditions.push(gt(packs.packIndex, filter.afterIndex));
    }
    return this.db
      .select()
      .from(packs)
      .where(and(...conditions))
      .orderBy(asc(packs.packIndex))
      .limit(filter.limit);
  }

  async get(network: string, packId: string): Promise<PackRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(packs)
      .where(and(eq(packs.network, network), eq(packs.packId, packId)));
    return row;
  }

  /** Every pack where `accountId` holds the Title or the Ticket. */
  async heldBy(network: string, accountId: string): Promise<PackRecord[]> {
    return this.list({ network, owner: accountId, limit: 1_000 });
  }

  /** The pack's events, newest first. */
  async history(network: string, packId: string, limit: number): Promise<EventRecord[]> {
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.network, network), eq(events.packId, packId)))
      .orderBy(desc(events.blockHeight), desc(events.logIndex))
      .limit(limit);
  }

  async checkpoint(network: string): Promise<CheckpointRecord | undefined> {
    const [row] = await this.db.select().from(checkpoints).where(eq(checkpoints.network, network));
    return row;
  }
}
