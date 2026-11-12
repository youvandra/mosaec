import { describe, expect, it } from 'vitest';

import { packStatusSchema, parseContractJson, positionViewSchema } from '@mosaec/domain';

import { PackService } from './pack-service';

import type { PackRecord, PackRepository } from '../repositories/pack-repository';
import type { PackReader } from '@mosaec/db/pack-row';

const PACK = '12.v0.mosaec.testnet';
const ZEC = 'nep141:zec.mosaec.testnet';
const USDC = 'nep141:usdc.mosaec.testnet';

/* The read model still shows the pack before its offer: free and empty. */
const STALE: PackRecord = {
  network: 'testnet',
  packId: PACK,
  packIndex: 12n,
  titleId: 't12',
  titleOwner: 'jennyco.testnet',
  ticketId: null,
  ticketOwner: null,
  state: 'free',
  rounds: 0,
  payToken: null,
  price: null,
  makerId: null,
  kToken: null,
  kAmount: null,
  termNs: null,
  offerExpiresAtNs: null,
  expiresAtNs: null,
  deadlineNs: null,
  disruptedAtNs: null,
  contents: null,
  contentsHash: null,
  ticketPending: false,
  commandInFlight: false,
  lastOutcome: null,
  mintedHeight: 1n,
  refreshedHeight: 1n,
};

const OFFERED = positionViewSchema.parse(
  parseContractJson(
    `{"pack":"${PACK}","position":{"index":12,"title_id":"t12","rounds":0,"stage":{"state":"offered","maker_id":"jennyco.testnet","pay_token":"${USDC}","price":"200000000","terms":{"k_token":"${USDC}","k_amount":"200010000","term_ns":900000000000},"open_until_ns":4611686018427387903,"contents":[{"token_id":"${ZEC}","amount":"25000000"}],"contents_hash":"${'a'.repeat(64)}"},"payout":null,"command_in_flight":false},"title_owner":"jennyco.testnet","ticket_owner":null,"title_pending":false,"ticket_pending":false}`,
  ),
);
const OFFERED_STATUS = packStatusSchema.parse(
  parseContractJson(
    '{"registry":"v0.mosaec.testnet","verifier":"intents.mosaec.testnet","phase":{"state":"free"},"delivery_in_flight":false,"exercise_in_flight":false,"exercise_deadline_ns":null}',
  ),
);

const repository = {
  get: () => Promise.resolve(STALE),
  history: () => Promise.resolve([]),
} as unknown as PackRepository;

function reader(fails = false): PackReader {
  return {
    positionOf: () => (fails ? Promise.reject(new Error('rpc down')) : Promise.resolve(OFFERED)),
    packStatus: () => Promise.resolve(OFFERED_STATUS),
    holdingsOf: () => Promise.resolve([]),
  };
}

describe('PackService.get', () => {
  it('shows a pack as the chain holds it while the read model trails', async () => {
    const service = new PackService(
      repository,
      () => 0n,
      () => reader(),
    );
    const pack = await service.get('testnet', PACK);
    expect(pack.state).toBe('offered');
    expect(pack.status).toBe('Open');
    expect(pack.contents).toEqual([expect.objectContaining({ symbol: 'ZEC', amount: '25000000' })]);
    expect(pack.offer).toMatchObject({ maker: 'jennyco.testnet' });
  });

  it('falls back to the read model when the chain does not answer', async () => {
    const service = new PackService(
      repository,
      () => 0n,
      () => reader(true),
    );
    const pack = await service.get('testnet', PACK);
    expect(pack.state).toBe('free');
    expect(pack.contents).toEqual([]);
  });

  it('shows a pack the read model has not seen yet', async () => {
    const unseen = {
      get: () => Promise.resolve(undefined),
      history: () => Promise.resolve([]),
    } as unknown as PackRepository;
    const service = new PackService(
      unseen,
      () => 0n,
      () => reader(),
    );
    const pack = await service.get('testnet', PACK);
    expect(pack).toMatchObject({ id: PACK, index: '12', state: 'offered' });
  });

  it('answers NOT_FOUND when neither the chain nor the read model has the pack', async () => {
    const unseen = {
      get: () => Promise.resolve(undefined),
      history: () => Promise.resolve([]),
    } as unknown as PackRepository;
    const service = new PackService(
      unseen,
      () => 0n,
      () => reader(true),
    );
    await expect(service.get('testnet', PACK)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
