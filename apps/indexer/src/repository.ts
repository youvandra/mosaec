import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { BlockRecords, EventRecord } from './extract';
import type { Db } from '@mosaec/db';
import type { PackRow } from '@mosaec/db/pack-row';

const { checkpoints, events, holdersHistory, offers, packs, tokens } = schema;

export type { PackRow };

export interface Checkpoint {
  readonly lastHeight: bigint;
  readonly lastBlockTimestampNs: string;
}

/** Events that end a pawn, with the status they give it. */
const CLOSING_EVENTS = { contents_released: 'Redeemed', expired: 'Forfeited' } as const;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface OfferCreated {
  maker_id: string;
  pay_token: string;
  price: string;
  offer_expires_at_ns: number | string;
  contents: unknown;
  contents_hash: string;
  terms: { k_token: string; k_amount: string; term_ns: number | string };
}

function tokenKind(tokenId: string): 'title' | 'ticket' {
  return tokenId.startsWith('t') ? 'title' : 'ticket';
}

/** The indexer's only access to the database. */
export class IndexerRepository {
  constructor(private readonly db: Db) {}

  async checkpoint(network: string, stream: string): Promise<Checkpoint | undefined> {
    const [row] = await this.db
      .select({
        lastHeight: checkpoints.lastHeight,
        lastBlockTimestampNs: checkpoints.lastBlockTimestampNs,
      })
      .from(checkpoints)
      .where(and(eq(checkpoints.network, network), eq(checkpoints.stream, stream)));
    return row;
  }

  /** Moves the checkpoint so the next step reads from `height`; stored events are kept. */
  async rewind(network: string, stream: string, height: bigint): Promise<void> {
    await this.db
      .insert(checkpoints)
      .values({ network, stream, lastHeight: height - 1n, lastBlockTimestampNs: '0' })
      .onConflictDoUpdate({
        target: [checkpoints.network, checkpoints.stream],
        set: { lastHeight: height - 1n, updatedAt: sql`now()` },
      });
  }

  /** Stores one block's records atomically. Safe to repeat. */
  async applyEvents(network: string, block: BlockRecords): Promise<void> {
    if (block.events.length === 0) {
      return;
    }
    await this.db.transaction(async (tx) => {
      for (const record of block.events) {
        await this.insertEvent(tx, network, block, record);
        await this.project(tx, network, block.height, record);
      }
    });
  }

  async setCheckpoint(
    network: string,
    stream: string,
    height: bigint,
    blockTimestampNs: string,
  ): Promise<void> {
    await this.db
      .insert(checkpoints)
      .values({ network, stream, lastHeight: height, lastBlockTimestampNs: blockTimestampNs })
      .onConflictDoUpdate({
        target: [checkpoints.network, checkpoints.stream],
        set: { lastHeight: height, lastBlockTimestampNs: blockTimestampNs, updatedAt: sql`now()` },
      });
  }

  /** Every pack the indexer has seen an event for. */
  async knownPacks(network: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ packId: events.packId })
      .from(events)
      .where(and(eq(events.network, network), isNotNull(events.packId)));
    return rows.flatMap((r) => (r.packId === null ? [] : [r.packId]));
  }

  /** Packs with events newer than their last refresh, oldest first, with that newest height. */
  async packsToRefresh(
    network: string,
    limit: number,
  ): Promise<{ packId: string; height: bigint }[]> {
    const latest = this.db
      .select({
        packId: events.packId,
        height: sql<string>`max(${events.blockHeight})`.as('height'),
      })
      .from(events)
      .where(and(eq(events.network, network), isNotNull(events.packId)))
      .groupBy(events.packId)
      .as('latest');
    const rows = await this.db
      .select({ packId: latest.packId, height: latest.height })
      .from(latest)
      .leftJoin(packs, and(eq(packs.network, network), eq(packs.packId, latest.packId)))
      .where(sql`${packs.refreshedHeight} is null or ${packs.refreshedHeight} < ${latest.height}`)
      .orderBy(latest.height)
      .limit(limit);
    return rows.flatMap((r) =>
      r.packId === null ? [] : [{ packId: r.packId, height: BigInt(r.height) }],
    );
  }

  /** The status the last closing event gave a pack, if any. */
  async lastOutcome(network: string, packId: string): Promise<'Redeemed' | 'Forfeited' | null> {
    const [row] = await this.db
      .select({ event: events.event })
      .from(events)
      .where(
        and(
          eq(events.network, network),
          eq(events.packId, packId),
          eq(events.standard, 'mosaec'),
          inArray(events.event, Object.keys(CLOSING_EVENTS)),
        ),
      )
      .orderBy(desc(events.blockHeight), desc(events.logIndex))
      .limit(1);
    return row === undefined ? null : CLOSING_EVENTS[row.event as keyof typeof CLOSING_EVENTS];
  }

  async mintedHeight(network: string, packId: string): Promise<bigint | null> {
    const [row] = await this.db
      .select({ height: events.blockHeight })
      .from(events)
      .where(
        and(
          eq(events.network, network),
          eq(events.packId, packId),
          eq(events.event, 'pack_minted'),
        ),
      )
      .limit(1);
    return row?.height ?? null;
  }

  async upsertPack(row: PackRow): Promise<void> {
    const update: Partial<PackRow> = { ...row };
    delete update.network;
    delete update.packId;
    await this.db
      .insert(packs)
      .values(row)
      .onConflictDoUpdate({ target: [packs.network, packs.packId], set: update });
  }

  private async insertEvent(
    tx: Tx,
    network: string,
    block: BlockRecords,
    r: EventRecord,
  ): Promise<void> {
    await tx
      .insert(events)
      .values({
        network,
        receiptId: r.receiptId,
        logIndex: r.logIndex,
        blockHeight: block.height,
        blockTimestampNs: block.timestampNs,
        txHash: r.txHash,
        executorId: r.executorId,
        standard: r.standard,
        event: r.event,
        packId: r.packId,
        data: r.data,
      })
      .onConflictDoNothing();
  }

  /** Updates offers, tokens and holders from one event. Each write is idempotent. */
  private async project(tx: Tx, network: string, height: bigint, r: EventRecord): Promise<void> {
    if (r.standard === 'mosaec' && r.packId !== null) {
      await this.projectMosaec(tx, network, height, r, r.packId);
    } else if (r.standard === 'nep171' && r.packId !== null) {
      await this.projectNft(tx, network, height, r, r.packId);
    }
  }

  private async projectMosaec(
    tx: Tx,
    network: string,
    height: bigint,
    r: EventRecord,
    packId: string,
  ): Promise<void> {
    const openOffer = and(
      eq(offers.network, network),
      eq(offers.packId, packId),
      eq(offers.status, 'open'),
    );
    switch (r.event) {
      case 'offer_created': {
        const d = r.data as OfferCreated;
        await tx
          .insert(offers)
          .values({
            network,
            receiptId: r.receiptId,
            packId,
            makerId: d.maker_id,
            payToken: d.pay_token,
            price: d.price,
            kToken: d.terms.k_token,
            kAmount: d.terms.k_amount,
            termNs: String(d.terms.term_ns),
            offerExpiresAtNs: String(d.offer_expires_at_ns),
            contents: d.contents,
            contentsHash: d.contents_hash,
            status: 'open',
            openedHeight: height,
          })
          .onConflictDoNothing();
        return;
      }
      case 'filled':
        await tx.update(offers).set({ status: 'filled', closedHeight: height }).where(openOffer);
        return;
      case 'offer_cancelled': {
        const reason = (r.data as { reason?: string }).reason;
        const status = reason === 'title_moved' ? 'title_moved' : 'cancelled';
        await tx.update(offers).set({ status, closedHeight: height }).where(openOffer);
        return;
      }
      default:
        return;
    }
  }

  private async projectNft(
    tx: Tx,
    network: string,
    height: bigint,
    r: EventRecord,
    packId: string,
  ): Promise<void> {
    const entries = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [];
    for (const entry of entries) {
      const tokenIds = Array.isArray(entry.token_ids) ? (entry.token_ids as string[]) : [];
      const burned = r.event === 'nft_burn';
      const owner = burned
        ? null
        : String(r.event === 'nft_transfer' ? entry.new_owner_id : entry.owner_id);
      for (const tokenId of tokenIds) {
        await tx
          .insert(tokens)
          .values({
            network,
            tokenId,
            kind: tokenKind(tokenId),
            packId,
            ownerId: owner,
            burned,
            updatedHeight: height,
          })
          .onConflictDoUpdate({
            target: [tokens.network, tokens.tokenId],
            set: { ownerId: owner, burned, updatedHeight: height },
            setWhere: sql`${tokens.updatedHeight} <= ${height}`,
          });
        await tx
          .insert(holdersHistory)
          .values({
            network,
            tokenId,
            receiptId: r.receiptId,
            logIndex: r.logIndex,
            ownerId: owner,
            fromHeight: height,
          })
          .onConflictDoNothing();
      }
    }
  }
}
