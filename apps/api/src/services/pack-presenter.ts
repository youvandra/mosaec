import { assetByTokenId } from '@mosaec/config/assets';
import { DUE_SOON_NS } from '@mosaec/domain';

import type { EventRecord, PackRecord } from '../repositories/pack-repository';
import type { NetworkId } from '@mosaec/config/assets';
import type { PawnStatus } from '@mosaec/domain';

/** The status the app shows for a pack row at `nowNs`; `null` for a free pack never pawned. */
export function statusOf(row: PackRecord, nowNs: bigint): PawnStatus | null {
  switch (row.state) {
    case 'offered':
      return 'Open';
    case 'free':
      return row.lastOutcome;
    case 'written': {
      if (row.ticketPending || row.commandInFlight) {
        return 'Pending';
      }
      const termEnd = BigInt(row.expiresAtNs ?? '0');
      const deadline = BigInt(row.deadlineNs ?? row.expiresAtNs ?? '0');
      if (nowNs > deadline) {
        return 'Forfeited';
      }
      if (nowNs > termEnd) {
        return 'Grace';
      }
      return termEnd - nowNs <= DUE_SOON_NS ? 'Due Soon' : 'Active';
    }
  }
}

interface ContentLineJson {
  token_id: string;
  amount: string;
}

function asset(network: NetworkId, tokenId: string | null) {
  if (tokenId === null) {
    return null;
  }
  const found = assetByTokenId(network, tokenId);
  return { tokenId, symbol: found?.symbol ?? null, decimals: found?.decimals ?? null };
}

/** A pack as the API returns it: amounts and times as decimal strings, never JS numbers. */
export function packDto(network: NetworkId, row: PackRecord, nowNs: bigint) {
  const contents = (row.contents as ContentLineJson[] | null) ?? [];
  return {
    id: row.packId,
    index: row.packIndex.toString(),
    state: row.state,
    status: statusOf(row, nowNs),
    title: { id: row.titleId, owner: row.titleOwner },
    ticket: row.ticketId === null ? null : { id: row.ticketId, owner: row.ticketOwner },
    contents: contents.map((line) => ({ ...asset(network, line.token_id), amount: line.amount })),
    contentsHash: row.contentsHash,
    offer:
      row.state === 'offered'
        ? {
            maker: row.makerId,
            price: { ...asset(network, row.payToken), amount: row.price },
            expiresAtNs: row.offerExpiresAtNs,
          }
        : null,
    terms:
      row.kToken === null
        ? null
        : {
            repayment: { ...asset(network, row.kToken), amount: row.kAmount },
            termNs: row.termNs,
            expiresAtNs: row.expiresAtNs,
            deadlineNs: row.deadlineNs,
            disruptedAtNs: row.disruptedAtNs,
          },
    rounds: row.rounds,
    mintedHeight: row.mintedHeight?.toString() ?? null,
    updatedHeight: row.refreshedHeight.toString(),
  };
}

export type PackDto = ReturnType<typeof packDto>;

export function eventDto(row: EventRecord) {
  return {
    receiptId: row.receiptId,
    txHash: row.txHash,
    height: row.blockHeight.toString(),
    timestampNs: row.blockTimestampNs,
    standard: row.standard,
    event: row.event,
    data: row.data,
  };
}
