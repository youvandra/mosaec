import { packRow } from '@mosaec/db/pack-row';
import { MosaecError } from '@mosaec/domain';

import { eventDto, packDto } from './pack-presenter';

import type { PackDto } from './pack-presenter';
import type { PackRecord, PackRepository } from '../repositories/pack-repository';
import type { NetworkId } from '@mosaec/config/assets';
import type { PackReader } from '@mosaec/db/pack-row';

/** Most events a pack page returns. */
const HISTORY_LIMIT = 200;

export type Clock = () => bigint;

/** Wall-clock time in nanoseconds, the unit the contracts use. */
export const systemClock: Clock = () => BigInt(Date.now()) * 1_000_000n;

export interface ListQuery {
  readonly network: NetworkId;
  readonly state?: PackRecord['state'];
  readonly owner?: string;
  readonly limit: number;
  readonly cursor?: string;
}

/** Pack accounts the registry mints: `<index>.v<n>.<root>`. */
const PACK_ID = /^\d+\.v\d+\.[a-z0-9.-]+$/;

/** Columns a pack row needs that a live read never sets. */
const EMPTY_ROW = { ticketPending: false, commandInFlight: false } as const;

/** Reads one pack live from the chain, per network. */
export type LivePacks = (network: NetworkId) => PackReader;

export class PackService {
  constructor(
    private readonly packs: PackRepository,
    private readonly now: Clock = systemClock,
    /** Absent: single packs come from the read model only. */
    private readonly reader: LivePacks | null = null,
  ) {}

  async list(query: ListQuery): Promise<{ items: PackDto[]; nextCursor: string | null }> {
    const rows = await this.packs.list({
      network: query.network,
      limit: query.limit,
      ...(query.state === undefined ? {} : { state: query.state }),
      ...(query.owner === undefined ? {} : { owner: query.owner }),
      ...(query.cursor === undefined ? {} : { afterIndex: BigInt(query.cursor) }),
    });
    const now = this.now();
    const last = rows.at(-1);
    return {
      items: rows.map((row) => packDto(query.network, row, now)),
      nextCursor:
        rows.length === query.limit && last !== undefined ? last.packIndex.toString() : null,
    };
  }

  async get(network: NetworkId, packId: string) {
    const [current, history] = await Promise.all([
      this.current(network, packId),
      this.packs.history(network, packId, HISTORY_LIMIT),
    ]);
    if (current === null) {
      throw new MosaecError('NOT_FOUND');
    }
    return { ...packDto(network, current, this.now()), history: history.map(eventDto) };
  }

  /**
   * Several packs with history in one call, from the read model only (a page asks for up to a
   * hundred); ids that are not packs are left out.
   */
  async details(network: NetworkId, packIds: readonly string[]) {
    const now = this.now();
    const items = await Promise.all(
      packIds.map(async (packId) => {
        const row = await this.packs.get(network, packId);
        if (row === undefined) return null;
        const history = await this.packs.history(network, packId, HISTORY_LIMIT);
        return { ...packDto(network, row, now), history: history.map(eventDto) };
      }),
    );
    return items.filter((item) => item !== null);
  }

  /** What `accountId` lends (holds a written Title), borrows (holds a Ticket) and owns outright. */
  async positions(network: NetworkId, accountId: string) {
    const now = this.now();
    const rows = await this.packs.heldBy(network, accountId);
    const dto = (row: PackRecord) => packDto(network, row, now);
    return {
      lending: rows.filter((r) => r.state === 'written' && r.titleOwner === accountId).map(dto),
      borrowing: rows.filter((r) => r.ticketOwner === accountId).map(dto),
      owned: rows.filter((r) => r.state !== 'written' && r.titleOwner === accountId).map(dto),
    };
  }

  /** Offers a lender can fill now. */
  async openOffers(network: NetworkId, limit: number) {
    const now = this.now();
    const rows = await this.packs.list({ network, state: 'offered', limit });
    return rows
      .filter((r) => r.offerExpiresAtNs === null || BigInt(r.offerExpiresAtNs) > now)
      .map((r) => packDto(network, r, now));
  }

  /** One pack as it stands now: the chain's view over the read model, or null when neither has it. */
  private async current(network: NetworkId, packId: string): Promise<PackRecord | null> {
    const row = (await this.packs.get(network, packId)) ?? null;
    return (await this.live(network, packId, row)) ?? row;
  }

  /**
   * The read model trails the chain by up to a minute, and a pack page is what someone opens right
   * after a transaction, sometimes before the read model has the pack at all. So one pack's state,
   * terms and contents come from the chain itself; the read model keeps what only history knows
   * (the last outcome, heights). Null when there is no live reader or the chain does not answer.
   */
  private async live(
    network: NetworkId,
    packId: string,
    row: PackRecord | null,
  ): Promise<PackRecord | null> {
    if (this.reader === null || !PACK_ID.test(packId)) return null;
    try {
      const reader = this.reader(network);
      const view = await reader.positionOf(packId);
      if (view === undefined) return null;
      const free = view.position.stage.state === 'free';
      const [status, holdings] = await Promise.all([
        reader.packStatus(packId),
        free ? reader.holdingsOf(packId) : Promise.resolve([]),
      ]);
      /* A round that just closed has an outcome the read model has not seen yet: unknown. */
      const closedUnseen = free && row !== null && row.state !== 'free';
      const live = packRow(
        network,
        view,
        status,
        {
          refreshedHeight: row?.refreshedHeight ?? 0n,
          lastOutcome: closedUnseen ? null : (row?.lastOutcome ?? null),
          mintedHeight: row?.mintedHeight ?? null,
        },
        holdings,
      );
      return { ...EMPTY_ROW, ...row, ...live } as PackRecord;
    } catch {
      return null;
    }
  }
}
