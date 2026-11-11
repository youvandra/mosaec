import { MosaecError } from '@mosaec/domain';

import { eventDto, packDto } from './pack-presenter';

import type { PackDto } from './pack-presenter';
import type { PackRecord, PackRepository } from '../repositories/pack-repository';
import type { NetworkId } from '@mosaec/config/assets';

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

export class PackService {
  constructor(
    private readonly packs: PackRepository,
    private readonly now: Clock = systemClock,
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
    const row = await this.packs.get(network, packId);
    if (row === undefined) {
      throw new MosaecError('NOT_FOUND');
    }
    const history = await this.packs.history(network, packId, HISTORY_LIMIT);
    return { ...packDto(network, row, this.now()), history: history.map(eventDto) };
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
}
